import {
  Component,
  ElementRef,
  ViewChild,
  ViewChildren,
  QueryList,
  NgZone,
  AfterViewInit,
  OnDestroy,
  Output,
  EventEmitter,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { fromEvent, Subscription } from 'rxjs';

interface ServiceNode {
  label: string;
  icon: string;
  x: number;
  y: number;
  type?: string;             // normalized type (e.g., 'vpc','ec2')
  w?: number;                // width (for containers)
  h?: number;                // height (for containers)
  parentIdx?: number | null; // index of container (e.g., VPC) if inside
  isContainer?: boolean;     // true for VPC window
}

interface Connection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: 'dashed' | 'solid';
}

type PortSide = 'top' | 'right' | 'bottom' | 'left';
interface PortRef { nodeIndex: number; side: PortSide; }
interface PortConnection { source: PortRef; target: PortRef; style: 'dashed' | 'solid'; }

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasRef', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChildren('nodeElem', { read: ElementRef }) nodeElems!: QueryList<ElementRef<HTMLDivElement>>;

  /** Emite o JSON do grafo para o Workspace -> TerraformPreview */
  @Output() graphChange = new EventEmitter<any>();

  // Estado
  droppedServices: ServiceNode[] = [];
  connections: Connection[] = []; // linhas “antigas” (click-to-click) — mantidas
  portConnections: PortConnection[] = [];
  portDraft: { from: PortRef | null; toXY?: { x: number; y: number } } = { from: null };

  // Modos UI (iguais aos seus botões)
  drawMode = false;
  deleteMode = false;
  serviceDeleteMode = false;
  lineStyle: 'dashed' | 'solid' | null = null;
  private drawStartPoint: { x: number; y: number } | null = null;

  // Drag interno do nó
  draggingIndex: number | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private subs = new Subscription();

  // ====== Resize da VPC ======
  private resizingIndex: number | null = null;
  private resizeStart = { x: 0, y: 0, w: 0, h: 0 };

  startVpcResize(i: number, ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    this.resizingIndex = i;
    const svc = this.droppedServices[i];
    this.resizeStart = {
      x: ev.clientX,
      y: ev.clientY,
      w: svc.w ?? 520,
      h: svc.h ?? 360
    };

    const moveSub = fromEvent<MouseEvent>(document, 'mousemove').subscribe(e => this.onVpcResizeMove(e));
    const upSub   = fromEvent<MouseEvent>(document, 'mouseup').subscribe(() => this.endVpcResize());
    this.subs.add(moveSub); this.subs.add(upSub);
  }

  private onVpcResizeMove(ev: MouseEvent) {
    if (this.resizingIndex == null) return;
    const svc = this.droppedServices[this.resizingIndex];
    const dx = ev.clientX - this.resizeStart.x;
    const dy = ev.clientY - this.resizeStart.y;

    const minW = 300, minH = 180;
    const maxW = 2000, maxH = 1200;
    const newW = Math.max(minW, Math.min(maxW, this.resizeStart.w + dx));
    const newH = Math.max(minH, Math.min(maxH, this.resizeStart.h + dy));

    this.droppedServices[this.resizingIndex] = {
      ...svc,
      w: Math.round(newW),
      h: Math.round(newH)
    };
  }

  private endVpcResize() {
    if (this.resizingIndex == null) return;
    this.resizingIndex = null;
    this.recomputeContainment();
  
    this.emitGraph();
  }

  /** Recalcula a associação de cada nó a uma VPC (se o centro cair dentro da janela) */
  private recomputeContainment() {
    // coletar VPCs (containers) com seus retângulos
    const vpcs = this.droppedServices
      .map((svc, idx) => ({ svc, idx }))
      .filter(x => (x.svc.type ?? this.normalizeType(x.svc.label)) === 'vpc');

    if (vpcs.length === 0) {
      // limpar qualquer parentIdx antigo
      this.droppedServices.forEach(s => { if (s.parentIdx !== undefined) s.parentIdx = null; });
      return;
    }

    // Função para verificar se um ponto está dentro do retângulo de uma VPC
    const inside = (x: number, y: number, rect: { x: number; y: number; w: number; h: number }) =>
      x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

    // Para cada nó NÃO-VPC, verifica se seu centro está dentro de alguma VPC
    this.droppedServices.forEach((svc, i) => {
      const t = (svc.type ?? this.normalizeType(svc.label));
      if (t === 'vpc') return;
      const cx = svc.x;
      const cy = svc.y;
      let parent: number | null = null;
      for (const { svc: v, idx } of vpcs) {
        const w = v.w ?? 480;
        const h = v.h ?? 320;
        const rect = { x: v.x, y: v.y, w, h };
        if (inside(cx, cy, rect)) { parent = idx; break; }
      }
      svc.parentIdx = parent;
    });
  }


  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {}
  ngAfterViewInit(): void {}
  ngOnDestroy(): void { this.subs.unsubscribe(); }

  // ===== Botões de modo =====
  toggleDashedMode() {
    this.drawMode = !(this.drawMode && this.lineStyle === 'dashed');
    if (this.drawMode) { this.deleteMode = false; this.serviceDeleteMode = false; this.lineStyle = 'dashed'; }
    else { this.lineStyle = null; }
    this.drawStartPoint = null;
  }

  toggleSolidMode() {
    this.drawMode = !(this.drawMode && this.lineStyle === 'solid');
    if (this.drawMode) { this.deleteMode = false; this.serviceDeleteMode = false; this.lineStyle = 'solid'; }
    else { this.lineStyle = null; }
    this.drawStartPoint = null;
  }

  toggleDeleteMode() {
    this.deleteMode = !this.deleteMode;
    if (this.deleteMode) {
      this.drawMode = false;
      this.serviceDeleteMode = false;
      this.lineStyle = null;
      this.drawStartPoint = null;
    }
  }

  toggleServiceDeleteMode() {
    this.serviceDeleteMode = !this.serviceDeleteMode;
    if (this.serviceDeleteMode) {
      this.drawMode = false;
      this.deleteMode = false;
      this.lineStyle = null;
      this.drawStartPoint = null;
    }
  }

  // ===== Canvas (linhas antigas) =====
  onCanvasClick(evt: MouseEvent) {
    if (this.portDraft.from) return;
    if (!this.drawMode || !this.lineStyle) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (!this.drawStartPoint) {
      this.drawStartPoint = { x, y };
    } else {
      this.connections.push({ x1: this.drawStartPoint.x, y1: this.drawStartPoint.y, x2: x, y2: y, style: this.lineStyle });
      this.drawStartPoint = null;
      this.emitGraph(); // se quiser considerar essas linhas no JSON, mantenha
    }
  }

  onLineClick(index: number) {
    if (!this.deleteMode) return;
    this.connections.splice(index, 1);
    this.emitGraph();
  }

  // ===== Drop do palette (mantém seu DnD) =====
  onDrop(event: CdkDragDrop<any>) {
    if ((event as any).previousContainer === (event as any).container) return;

    const mouseEvt = (event as any).event as MouseEvent;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = mouseEvt.clientX - rect.left;
    const y = mouseEvt.clientY - rect.top;

    const data = (event.item.data || {}) as Partial<ServiceNode>;
    const label = (data.label ?? (data as any).type ?? 'SERVICE') as string;
    const norm = this.normalizeType(label);
    if (norm === 'vpc') {
      this.droppedServices.push({
        label,
        icon: data.icon ?? 'icons/vpc.png',
        x, y,
        type: 'vpc', isContainer: true,
        w: 520, h: 360,
        parentIdx: null
      });
    } else {
      this.droppedServices.push({
        label,
        icon: data.icon ?? '',
        x, y,
        parentIdx: null
      });
    }

    this.recomputeContainment();
    this.emitGraph();
  }

  // ===== Nó: apagar / mover =====
  onServiceClick(idx: number, evt: MouseEvent) {
    if (!this.serviceDeleteMode) return;
    evt.stopPropagation();

    this.droppedServices.splice(idx, 1);

    // remove conexões relacionadas e realinha índices
    this.portConnections = this.portConnections
      .filter(pc => pc.source.nodeIndex !== idx && pc.target.nodeIndex !== idx)
      .map(pc => ({
        ...pc,
        source: { nodeIndex: pc.source.nodeIndex > idx ? pc.source.nodeIndex - 1 : pc.source.nodeIndex, side: pc.source.side },
        target: { nodeIndex: pc.target.nodeIndex > idx ? pc.target.nodeIndex - 1 : pc.target.nodeIndex, side: pc.target.side },
      }));

    this.emitGraph();
  }

  
startNodeDrag(i: number, evt: MouseEvent) {
    if (this.serviceDeleteMode) return;
    const t = (evt.target as HTMLElement);
    if (t.classList.contains('port')) return; // não inicia drag se clicou na porta
    evt.preventDefault();

    this.draggingIndex = i;
    // Permite arrastar tanto nodes quanto a VPC (container com header)
    const dragEl = t.closest('.node, .vpc-container') as HTMLElement | null;
    if (!dragEl) return;
    const rect = dragEl.getBoundingClientRect();
    this.offsetX = evt.clientX - rect.left;
    this.offsetY = evt.clientY - rect.top;

    const moveSub = fromEvent<MouseEvent>(document, 'mousemove').subscribe(m => this.onNodeMove(m));
    const upSub   = fromEvent<MouseEvent>(document, 'mouseup').subscribe(() => this.endNodeDrag());
    this.subs.add(moveSub); this.subs.add(upSub);
  }


  private onNodeMove(evt: MouseEvent) {
    if (this.draggingIndex === null) return;
  
    this.ngZone.run(() => {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      let x = evt.clientX - rect.left - this.offsetX;
      let y = evt.clientY - rect.top  - this.offsetY;
      x = Math.max(0, Math.min(x, rect.width));
      y = Math.max(0, Math.min(y, rect.height));
  
      this.droppedServices[this.draggingIndex!] = {
        ...this.droppedServices[this.draggingIndex!],
        x, y
      };
  
      // mantém as linhas coladas durante o drag
      this.cdr.detectChanges();
    });
  }
  

  private endNodeDrag() {
    this.draggingIndex = null;
    this.subs.unsubscribe();
    this.subs = new Subscription();
    // mover nó não altera o HCL (não emite)
  
    this.recomputeContainment();

    this.emitGraph();
  }

  
  // Mapeia o índice do droppedServices (que inclui VPCs) para o índice do DOM (apenas .node)
  private domIndexForNode(nodeIndex: number): number {
    let count = -1;
    for (let idx = 0; idx <= nodeIndex; idx++) {
      const s = this.droppedServices[idx];
      const t = (s.type ?? this.normalizeType(s.label));
      if (t !== 'vpc') count++;
    }
    return count;
  }

// ===== Portas =====
  getPortXY(ref: PortRef): { x: number; y: number } {
    // usa o estado (left/top) + tamanho real do elemento
    const domIdx = this.domIndexForNode(ref.nodeIndex);
    const el = domIdx >= 0 ? this.nodeElems?.toArray()[domIdx]?.nativeElement : null;
    const node = this.droppedServices[ref.nodeIndex];
    if (!el || !node) return { x: 0, y: 0 };
  
    const w = el.offsetWidth;
    const h = el.offsetHeight;
  
    // left/top já são relativos ao canvas, então é direto
    const left = node.x;
    const top  = node.y;
  
    switch (ref.side) {
      case 'top':    return { x: left + w / 2, y: top };
      case 'right':  return { x: left + w,     y: top + h / 2 };
      case 'bottom': return { x: left + w / 2, y: top + h };
      case 'left':   return { x: left,         y: top + h / 2 };
    }
  }
  

  onPortDown(nodeIndex: number, side: PortSide, ev: MouseEvent) {
    ev.stopPropagation();
    this.portDraft = { from: { nodeIndex, side } };
  }

  onPortUp(nodeIndex: number, side: PortSide, ev: MouseEvent) {
    ev.stopPropagation();
    const from = this.portDraft.from;
    if (!from) return;

    const target: PortRef = { nodeIndex, side };
    // prevenir clique na mesma porta
    if (from.nodeIndex === target.nodeIndex && from.side === target.side) {
      this.portDraft = { from: null };
      return;
    }

    const style: 'dashed' | 'solid' = (this.lineStyle ?? 'solid');
    this.portConnections = [...this.portConnections, { source: from, target, style }];
    this.portDraft = { from: null };

    this.emitGraph();
  }

  onCanvasMouseMove(ev: MouseEvent) {
    if (!this.portDraft.from) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.portDraft = { ...this.portDraft, toXY: { x: ev.clientX - rect.left, y: ev.clientY - rect.top } };
  }

  onCanvasMouseLeave() {
    this.portDraft = { from: null };
  }

  onPortLineClick(index: number) {
    if (!this.deleteMode) return;
    this.portConnections = this.portConnections.filter((_, i) => i !== index);
    this.emitGraph();
  }

  // ===== Reset total (Topbar chama) =====
  public clearAll() {
    this.droppedServices = [];
    this.connections = [];
    this.portConnections = [];
    this.drawMode = false;
    this.deleteMode = false;
    this.serviceDeleteMode = false;
    this.lineStyle = null;
    this.drawStartPoint = null;
    this.portDraft = { from: null };
    this.emitGraph();
  }

  // ======= JSON do grafo -> TerraformPreview gera HCL =======
  private emitGraph() {
    this.graphChange.emit(this.generateConfigJson());
  }

  normalizeType(label: string): string {
    const s = label.trim().toLowerCase();
    if (s.includes('dynamo')) return 'dynamodb';
    if (s.includes('glue'))   return 'glue';
    if (s.includes('ecs'))    return 'ecs';
    if (s.includes('ec2'))    return 'ec2';
    if (s.includes('vpc'))    return 'vpc';
    return s;
  }

  /** Gera um JSON simples de infra (variables, data e resources) */
  private generateConfigJson(): any {
    const nodes = this.droppedServices.map((n, idx) => ({
      id: `node_${idx}`,
      type: this.normalizeType(n.label),
      label: n.label
    }));
  
    const edges = this.portConnections.map(pc => ({
      source: `node_${pc.source.nodeIndex}`,
      target: `node_${pc.target.nodeIndex}`
    }));
  
    const resources: any[] = [];
    const dataBlocks: any[] = [];
    const variables: any[] = [];
    const providers: any[] = [];
  
    // -------------------------
    // LocalStack provider + var
    // -------------------------
    variables.push({
      name: 'localstack_endpoint',
      type: 'string',
      default: 'http://localhost:4566',
      description: 'Endpoint do LocalStack'
    });
  
    providers.push({
      name: 'aws',
      properties: {
        region: 'sa-east-1',
        access_key: 'test',
        secret_key: 'test',
        skip_credentials_validation: true,
        skip_requesting_account_id: true,
        skip_metadata_api_check: true,
        s3_force_path_style: true,
        endpoints: {
          dynamodb: '${var.localstack_endpoint}',
          glue:     '${var.localstack_endpoint}',
          iam:      '${var.localstack_endpoint}',
          sts:      '${var.localstack_endpoint}',
          s3:       '${var.localstack_endpoint}',
          ec2:      '${var.localstack_endpoint}',   // <-- ADICIONE ESTA
          ecs:      '${var.localstack_endpoint}',
        }
      }
    });

    // -------------------------
    // Helpers de grafo
    // -------------------------
    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, new Set());
      if (!adj.has(e.target)) adj.set(e.target, new Set());
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
    
    // Contenção VPC: adiciona vizinhança entre cada nó e a VPC que o contém (sem desenhar linha)
    this.droppedServices.forEach((svc, i) => {
      const p = svc.parentIdx;
      if (p === null || p === undefined) return;
      const pType = (this.droppedServices[p].type ?? this.normalizeType(this.droppedServices[p].label));
      if (pType !== 'vpc') return;
      const a = nodes[i].id, b = nodes[p].id;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    });


    const neighbors = (id: string) => Array.from(adj.get(id) ?? []);

    // -------------------------
    // VPCs (com subnet, route table, associação e SG)
    // -------------------------
    const vpcNodes = nodes.filter(n => n.type === 'vpc');
    const vpcNameById = new Map<string, string>(); // node.id -> terraform name prefix
    vpcNodes.forEach((n, i) => {
      const base = `vpc_${i+1}`;
      vpcNameById.set(n.id, base);

      resources.push({
        type: 'aws_vpc',
        name: base,
        properties: { cidr_block: '10.0.0.0/16' }
      });

      resources.push({
        type: 'aws_subnet',
        name: `${base}_subnet`,
        properties: {
          vpc_id: '${aws_vpc.' + base + '.id}',
          cidr_block: '10.0.1.0/24',
          map_public_ip_on_launch: true
        }
      });

      resources.push({
        type: 'aws_route_table',
        name: `${base}_rt`,
        properties: { vpc_id: '${aws_vpc.' + base + '.id}' }
      });

      resources.push({
        type: 'aws_route_table_association',
        name: `${base}_rta`,
        properties: {
          subnet_id: '${aws_subnet.' + `${base}_subnet` + '.id}',
          route_table_id: '${aws_route_table.' + `${base}_rt` + '.id}'
        }
      });

      resources.push({
        type: 'aws_security_group',
        name: `${base}_sg`,
        properties: {
          name: `${base}-sg`,
          description: 'default sg',
          vpc_id: '${aws_vpc.' + base + '.id}'
        },
        blocks: [
          { name: 'ingress', body: { from_port: 0, to_port: 0, protocol: '-1', cidr_blocks: ['0.0.0.0/0'] } },
          { name: 'egress',  body: { from_port: 0, to_port: 0, protocol: '-1', cidr_blocks: ['0.0.0.0/0'] } },
        ]
      });});


    // -------------------------
    // EC2 (ligado à VPC se houver)
    // -------------------------
    const ec2Nodes = nodes.filter(n => n.type === 'ec2');
    ec2Nodes.forEach((n, i) => {
      const ec2Name = `ec2_${i+1}`;

      // tenta achar VPC vizinha
      const vpcNeighbor = neighbors(n.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 'vpc');

      let vpcBase: string;
      if (vpcNeighbor) {
        vpcBase = vpcNameById.get(vpcNeighbor!.id)!;
      } else {
        // cria uma VPC mínima dedicada pra este EC2
        vpcBase = `${ec2Name}_vpc`;
        resources.push({ type: 'aws_vpc', name: vpcBase, properties: { cidr_block: '10.1.0.0/16' } });
        resources.push({
          type: 'aws_subnet',
          name: `${vpcBase}_subnet`,
          properties: { vpc_id: '${aws_vpc.' + vpcBase + '.id}', cidr_block: '10.1.1.0/24', map_public_ip_on_launch: true }
        });
        resources.push({ type: 'aws_security_group', name: `${vpcBase}_sg`, properties: {
          name: `${vpcBase}-sg`, vpc_id: '${aws_vpc.' + vpcBase + '.id}'
        }});
      }

      // Role/InstanceProfile só se ligar em Dynamo depois (abaixo)
      resources.push({
        type: 'aws_instance',
        name: ec2Name,
        properties: {
          ami: 'ami-12345678', // LocalStack mock
          instance_type: 't3.micro',
          subnet_id: '${aws_subnet.' + `${vpcBase}_subnet` + '.id}',
          vpc_security_group_ids: ['${aws_security_group.' + `${vpcBase}_sg` + '.id}']
        }
      });

      // Se houver relação EC2 ↔ DynamoDB, cria role/policy/profile:
      const dynNeighbor = neighbors(n.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 'dynamodb');
      if (dynNeighbor) {
        const dynIndex = dynamoNodes.findIndex(d => d.id === dynNeighbor!.id);
        const dynRes = `dynamo_${dynIndex + 1}`;

        // role + policy + attach + profile
        resources.push({
          type: 'aws_iam_role',
          name: `${ec2Name}_role`,
          properties: {
            name: `${ec2Name}-role`,
            assume_role_policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [{ Effect: 'Allow', Principal: { Service: 'ec2.amazonaws.com' }, Action: 'sts:AssumeRole' }]
            })
          }
        });
        resources.push({
          type: 'aws_iam_role_policy',
          name: `${ec2Name}_dynamo_policy`,
          properties: {
            name: `${ec2Name}-dynamo`,
            role: '${aws_iam_role.' + `${ec2Name}_role` + '.id}',
            policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Action: ['dynamodb:GetItem','dynamodb:PutItem','dynamodb:Query','dynamodb:Scan','dynamodb:UpdateItem'],
                Resource: ['*'] // simplificado p/ LocalStack; poderia apontar p/ ARN da tabela
              }]
            })
          }
        });
        resources.push({
          type: 'aws_iam_instance_profile',
          name: `${ec2Name}_profile`,
          properties: { name: `${ec2Name}-profile`, role: '${aws_iam_role.' + `${ec2Name}_role` + '.name}' }
        });

        // associa o profile à instância
        const inst = resources.find(r => r.type === 'aws_instance' && r.name === ec2Name);
        if (inst) { inst.properties['iam_instance_profile'] = '${aws_iam_instance_profile.' + `${ec2Name}_profile` + '.name}'; }
      }
    });

    // -------------------------
    // ECS (Fargate) + rede da VPC e integração com Dynamo se houver
    // -------------------------
    const ecsNodes = nodes.filter(n => n.type === 'ecs');
    ecsNodes.forEach((n, i) => {
      const ecsBase = `ecs_${i+1}`;

      // VPC vizinha (ou cria dedicada)
      const vpcNeighbor = neighbors(n.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 'vpc');
      let vpcBase: string;
      if (vpcNeighbor) {
        vpcBase = vpcNameById.get(vpcNeighbor!.id)!;
      } else {
        vpcBase = `${ecsBase}_vpc`;
        resources.push({ type: 'aws_vpc', name: vpcBase, properties: { cidr_block: '10.2.0.0/16' } });
        resources.push({
          type: 'aws_subnet',
          name: `${vpcBase}_subnet`,
          properties: { vpc_id: '${aws_vpc.' + vpcBase + '.id}', cidr_block: '10.2.1.0/24', map_public_ip_on_launch: true }
        });
        resources.push({ type: 'aws_security_group', name: `${vpcBase}_sg`, properties: {
          name: `${vpcBase}-sg`, vpc_id: '${aws_vpc.' + vpcBase + '.id}'
        }});
      }

      // Roles de execução da tarefa
      dataBlocks.push({
        type: 'aws_iam_policy_document',
        name: `${ecsBase}_assume`,
        properties: {},
        blocks: [{ name: 'statement', body: {
          actions: ['sts:AssumeRole'],
          principals: { type: 'Service', identifiers: ['ecs-tasks.amazonaws.com'] }
        }}]
      });

      resources.push({
        type: 'aws_iam_role',
        name: `${ecsBase}_exec_role`,
        properties: {
          name: `${ecsBase}-exec-role`,
          assume_role_policy: '${data.aws_iam_policy_document.' + `${ecsBase}_assume` + '.json}'
        }
      });

      // Task definition
      const containerEnv: any[] = [];
      // Se tiver S3 vizinho, cria env e policy
      const s3Neighbor = neighbors(n.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 's3');
      if (s3Neighbor) {
        const s3NodesArr = nodes.filter(nn => nn.type === 's3');
        const s3Index = s3NodesArr.findIndex(s => s.id === s3Neighbor!.id);
        const s3Res = `s3_${s3Index + 1}`;
        containerEnv.push({ name: 'S3_BUCKET', value: '${aws_s3_bucket.' + s3Res + '.bucket}' });
        resources.push({
          type: 'aws_iam_role_policy',
          name: `${ecsBase}_s3_policy`,
          properties: {
            name: `${ecsBase}-s3`,
            role: '${aws_iam_role.' + `${ecsBase}_exec_role` + '.id}',
            policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Action: ['s3:PutObject','s3:GetObject','s3:ListBucket'],
                Resource: [
                  '${' + 'aws_s3_bucket.' + s3Res + '.arn}',
                  '${' + 'aws_s3_bucket.' + s3Res + '.arn}/' + '*'
                ]
              }]
            })
          }
        });
      }

      // Se tiver Dynamo vizinho, cria env e policy
      const dynNeighbor = neighbors(n.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 'dynamodb');

      if (dynNeighbor) {
        const dynIndex = dynamoNodes.findIndex(d => d.id === dynNeighbor!.id);
        const dynRes = `dynamo_${dynIndex + 1}`;
        containerEnv.push({ name: 'DYNAMO_TABLE', value: '${aws_dynamodb_table.' + dynRes + '.name}' });

        resources.push({
          type: 'aws_iam_role_policy',
          name: `${ecsBase}_dynamo_policy`,
          properties: {
            name: `${ecsBase}-dynamo`,
            role: '${aws_iam_role.' + `${ecsBase}_exec_role` + '.id}',
            policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Action: ['dynamodb:GetItem','dynamodb:PutItem','dynamodb:Query','dynamodb:Scan','dynamodb:UpdateItem'],
                Resource: ['*']
              }]
            })
          }
        });
      }

      resources.push({
        type: 'aws_ecs_task_definition',
        name: `${ecsBase}_task`,
        properties: {
          family: `${ecsBase}-family`,
          requires_compatibilities: ['FARGATE'],
          network_mode: 'awsvpc',
          cpu: '256',
          memory: '512',
          execution_role_arn: '${aws_iam_role.' + `${ecsBase}_exec_role` + '.arn}',
          container_definitions: JSON.stringify([{
            name: `${ecsBase}-app`,
            image: 'nginx:latest',
            essential: true,
            environment: containerEnv
          }])
        }
      });

      resources.push({
        type: 'aws_ecs_cluster',
        name: `${ecsBase}_cluster`,
        properties: { name: `${ecsBase}-cluster` }
      });

      resources.push({
        type: 'aws_ecs_service',
        name: `${ecsBase}_svc`,
        properties: {
          name: `${ecsBase}-service`,
          cluster: '${aws_ecs_cluster.' + `${ecsBase}_cluster` + '.id}',
          task_definition: '${aws_ecs_task_definition.' + `${ecsBase}_task` + '.arn}',
          desired_count: 1,
          launch_type: 'FARGATE',
          network_configuration: {
            subnets: ['${aws_subnet.' + `${vpcBase}_subnet` + '.id}'],
            security_groups: ['${aws_security_group.' + `${vpcBase}_sg` + '.id}'],
            assign_public_ip: true
          }
        }
      });});


    // -------------------------
    // VPC ↔ DynamoDB => endpoint Gateway do Dynamo
    // -------------------------
    edges.forEach((e, idx) => {
      const s = nodes.find(n => n.id === e.source);
      const t = nodes.find(n => n.id === e.target);
      if (!s || !t) return;
      const pair = [s, t];

      const vpc   = pair.find(n => n.type === 'vpc');
      const dynamo = pair.find(n => n.type === 'dynamodb');
      if (vpc && dynamo) {
        const vpcBase = vpcNameById.get(vpc.id);
        if (vpcBase) {
          /* LocalStack: removed aws_vpc_endpoint (provider endpoints suffice) */
}
      }
    });    
  
    // -------------------------
    // DynamoDB tables (PROVISIONED + TTL + GSI + tags)
    // -------------------------
    const dynamoNodes = nodes.filter(n => n.type === 'dynamodb');
    dynamoNodes.forEach((n, i) => {
      const vpcNeighbor = neighbors(n.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 'vpc');
      let dynVpcBase: string | null = null;
      if (vpcNeighbor) dynVpcBase = vpcNameById.get(vpcNeighbor!.id)!;

      const resName = `dynamo_${i + 1}`;
      const tableName = resName; // você pode trocar por "GameScores" se quiser
  
      resources.push({
        type: 'aws_dynamodb_table',
        name: resName,
        properties: {
          name: tableName,
          billing_mode: 'PAY_PER_REQUEST',hash_key: 'UserId',
          range_key: 'GameTitle',
          tags: {
            Name: tableName,
            Environment: 'local'
          }
        },
        blocks: [
          { name: 'attribute', body: { name: 'UserId',   type: 'S' } },
          { name: 'attribute', body: { name: 'GameTitle', type: 'S' } },
          { name: 'attribute', body: { name: 'TopScore',  type: 'N' } },
          { name: 'ttl', body: { attribute_name: 'TimeToExist', enabled: false } },
          {
            name: 'global_secondary_index',
            body: {
              name: 'GameTitleIndex',
              hash_key: 'GameTitle',
              range_key: 'TopScore',projection_type: 'ALL'
            }
          }
        ]
      });
      if (dynVpcBase) {
        resources.push({
          type: 'aws_vpc_endpoint',
          name: `${resName}_vpce`,
          properties: {
            vpc_id: '${aws_vpc.' + dynVpcBase + '.id}',
            service_name: 'com.amazonaws.sa-east-1.dynamodb',
            vpc_endpoint_type: 'Gateway',
            route_table_ids: ['${aws_route_table.' + dynVpcBase + '_rt.id}']
          }
        });
      }
    });

  
    // -------------------------
    
    // -------------------------
    // S3 buckets
    // -------------------------
    const s3Nodes = nodes.filter(n => n.type === 's3');
    s3Nodes.forEach((n, i) => {
      const resName = `s3_${i+1}`;
      const bucketName = resName; // pode customizar depois

      resources.push({
        type: 'aws_s3_bucket',
        name: resName,
        properties: {
          bucket: bucketName,
          force_destroy: true,
          tags: { Environment: 'dev', ManagedBy: 'canvas' }
        }
      });

      // Se houver VPC vizinha (ou contenção), cria endpoint Gateway do S3
      const vpcNeighbor = neighbors(n.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 'vpc');
      if (vpcNeighbor) {
        const vpcBase = vpcNameById.get(vpcNeighbor!.id)!;
        resources.push({
          type: 'aws_vpc_endpoint',
          name: `${resName}_vpce`,
          properties: {
            vpc_id: '${aws_vpc.' + vpcBase + '.id}',
            service_name: 'com.amazonaws.sa-east-1.s3',
            vpc_endpoint_type: 'Gateway',
            route_table_ids: ['${aws_route_table.' + vpcBase + '_rt.id}']
          }
        });
      }
    });

    // Glue base (se houver Glue)
    const glueNodes = nodes.filter(n => n.type === 'glue');
    const glueConnByIdx: boolean[] = new Array(glueNodes.length).fill(false);
    glueNodes.forEach((g, gi) => {
      const vpcNeighbor = neighbors(g.id)
        .map(id => nodes.find(nn => nn.id === id))
        .find(nn => nn?.type === 'vpc');
      if (vpcNeighbor) {
        const vpcBase = vpcNameById.get(vpcNeighbor!.id)!;
        resources.push({
          type: 'aws_glue_connection',
          name: `glue_conn_${gi+1}`,
          properties: {
            name: `glue-conn-${gi+1}`,
            connection_type: 'NETWORK'
          },
          blocks: [
            { name: 'physical_connection_requirements', body: {
              security_group_id_list: ['${aws_security_group.' + vpcBase + '_sg.id}'],
              subnet_id: '${aws_subnet.' + vpcBase + '_subnet.id}'
            } }
          ]
        });
        glueConnByIdx[gi] = true;
      }
    });

    // -------------------------
    const hasGlue = nodes.some(n => n.type === 'glue');
    if (hasGlue) {
      dataBlocks.push({
        type: 'aws_iam_policy_document',
        name: 'glue_assume',
        properties: {},
        blocks: [
          {
            name: 'statement',
            body: {
              actions: ['sts:AssumeRole'],
              principals: { type: 'Service', identifiers: ['glue.amazonaws.com'] }
            }
          }
        ]
      });
  
      resources.push({
        type: 'aws_iam_role',
        name: 'glue_role',
        properties: {
          name: 'iac-glue-role',
          assume_role_policy: '${data.aws_iam_policy_document.glue_assume.json}'
        }
      });
  
      resources.push({
        type: 'aws_glue_catalog_database',
        name: 'db',
        properties: { name: 'iac_db' }
      });
    }
  
    // -------------------------
    // Crawler para cada ligação Glue <-> Dynamo
    // -------------------------
    edges.forEach((e, idx) => {
      const s = nodes.find(n => n.id === e.source);
      const t = nodes.find(n => n.id === e.target);
      if (!s || !t) return;
  
      const pair = [s, t];
      const glue   = pair.find(n => n.type === 'glue');
      const dynamo = pair.find(n => n.type === 'dynamodb');
      if (glue && dynamo) {
        const dynIndex = dynamoNodes.findIndex(d => d.id === dynamo.id);
        const dynRes = `dynamo_${dynIndex + 1}`;
  
        resources.push({
          type: 'aws_glue_crawler',
          name: `glue_to_${dynRes}_${idx + 1}`,
          properties: {
            name: `glue-to-${dynRes}-${idx + 1}`,
            role: '${aws_iam_role.glue_role.arn}',
            database_name: '${aws_glue_catalog_database.db.name}'
          },
          blocks: [
            { name: 'dynamodb_target', body: { path: '${aws_dynamodb_table.' + dynRes + '.name}' } }
          ]
        });
      }
    });
  
    return { variables, providers, data: dataBlocks, resources };
  }  
  /** Reconstrói nós e conexões a partir de um config JSON (como o gerado pelo parser). */
  /** Reconstrói nós e conexões a partir de um config JSON (como o gerado pelo parser). */
  public loadFromConfig(config: any) {
    // 1) Salva os ícones atuais por tipo (pra não perder ao recarregar)
    const iconByType = new Map<string, string>();
    for (const n of this.droppedServices) {
      const t = this.normalizeType(n.label);
      if (n.icon && !iconByType.has(t)) iconByType.set(t, n.icon);
    }
  
    // 2) Limpa estado
    this.droppedServices = [];
    this.connections = [];
    this.portConnections = [];
    this.drawMode = false;
    this.deleteMode = false;
    this.serviceDeleteMode = false;
    this.lineStyle = null;
    this.portDraft = { from: null };
  
    const resources = Array.isArray(config?.resources) ? config.resources : [];
  
    // -------------------------
    // Glue + Dynamo (seu comportamento atual)
    // -------------------------
  
    // DynamoDB -> nós (um nó por tabela)
    const dynamoRes = resources.filter((r: any) => r.type === 'aws_dynamodb_table');
    const dynIndexByName = new Map<string, number>();
  
    // cria 1 nó Glue se houver algo de Glue
    const hasGlue =
      resources.some((r: any) => r.type === 'aws_glue_crawler') ||
      resources.some((r: any) => r.type === 'aws_glue_catalog_database') ||
      resources.some((r: any) => r.type === 'aws_iam_role');
  
    let glueIndex: number | null = null;
    if (hasGlue) {
      this.droppedServices.push({
        label: 'Glue',
        icon: iconByType.get('glue') ?? this.defaultIconFor('glue'),
        x: 200,
        y: 200
      });
      glueIndex = 0;
    }
  
    // posiciona os Dynamo à direita do Glue (ou iniciais)
    const startX = hasGlue ? 460 : 200;
    let dx = startX;
    const y = 200;
  
    dynamoRes.forEach((r: any) => {
      const nodeLabel = 'Dynamo';
      this.droppedServices.push({
        label: nodeLabel,
        icon: iconByType.get('dynamodb') ?? this.defaultIconFor('dynamodb'),
        x: dx,
        y
      });
      const idx = this.droppedServices.length - 1;
      dynIndexByName.set(r.name, idx);
      dx += 220;
    });
  
    // Conexões: cada glue crawler com dynamodb_target -> link
    const crawlers = resources.filter((r: any) => r.type === 'aws_glue_crawler');
    for (const c of crawlers) {
      const dynBlock = (c.blocks || []).find((b: any) => b.name === 'dynamodb_target');
      const path: string | undefined = dynBlock?.body?.path;
      if (!path) continue;
      const m = /\${aws_dynamodb_table\.([A-Za-z0-9_\-]+)\.name}/.exec(path);
      if (!m) continue;
      const dynName = m[1];
      const dynIdx = dynIndexByName.get(dynName);
      if (glueIndex !== null && dynIdx !== undefined) {
        this.portConnections.push({
          source: { nodeIndex: glueIndex, side: 'right' },
          target: { nodeIndex: dynIdx, side: 'left' },
          style: 'solid'
        });
      }
    }
  
    // -------------------------
    // RECONSTRUÇÃO EXTRA: VPC/EC2/ECS/Dynamo + ligações
    // -------------------------
    try {
      const byType = (t: string) => resources.filter((r: any) => r.type === t);
  
      // Helpers de aresta (evita duplicatas)
      const edgeKey = (a: number, b: number) => `${Math.min(a,b)}->${Math.max(a,b)}`;
      const existingEdges = new Set<string>();
      const link = (srcIdx: number, dstIdx: number, style: 'solid'|'dashed'='solid') => {
        const k = edgeKey(srcIdx, dstIdx);
        if (existingEdges.has(k)) return;
        this.portConnections.push({
          source: { nodeIndex: srcIdx, side: 'right' },
          target: { nodeIndex: dstIdx, side: 'left' },
          style
        });
        existingEdges.add(k);
      };
  
      // Layout simples para novos nós (fora dos já criados p/ Glue/Dynamo)
      const grid = { col: 0 };
      const nextPos = () => {
        const x = 60 + (grid.col % 4) * 220;
        const y = 80 + Math.floor(grid.col / 4) * 200;
        grid.col++;
        return { x, y };
      };
  
      // Indexadores de nós criados aqui
      const vpcIdxByBase = new Map<string, number>(); // base = nome do recurso aws_vpc.<name>
      const ec2IdxByName = new Map<string, number>(); // name = aws_instance.<name>
      const ecsIdxByBase = new Map<string, number>(); // base ~ ecs_N
  
      const ensureVpcNode = (base: string) => {
        if (vpcIdxByBase.has(base)) return vpcIdxByBase.get(base)!;
        const pos = nextPos();
        this.droppedServices.push({
          label: 'VPC',
          icon: iconByType.get('vpc') ?? this.defaultIconFor('vpc'),
          x: pos.x,
          y: pos.y
        });
        const idx = this.droppedServices.length - 1;
        vpcIdxByBase.set(base, idx);
        return idx;
      };
  
      const ensureEc2Node = (name: string) => {
        if (ec2IdxByName.has(name)) return ec2IdxByName.get(name)!;
        const pos = nextPos();
        this.droppedServices.push({
          label: 'EC2',
          icon: iconByType.get('ec2') ?? this.defaultIconFor('ec2'),
          x: pos.x,
          y: pos.y
        });
        const idx = this.droppedServices.length - 1;
        ec2IdxByName.set(name, idx);
        return idx;
      };
  
      const ensureEcsNode = (base: string) => {
        if (ecsIdxByBase.has(base)) return ecsIdxByBase.get(base)!;
        const pos = nextPos();
        this.droppedServices.push({
          label: 'ECS',
          icon: iconByType.get('ecs') ?? this.defaultIconFor('ecs'),
          x: pos.x,
          y: pos.y
        });
        const idx = this.droppedServices.length - 1;
        ecsIdxByBase.set(base, idx);
        return idx;
      };
  
      // Subnets -> base da VPC (assumindo padrão "<base>_subnet")
      const subnetBaseByName = new Map<string, string>(); // "vpc_1_subnet" -> "vpc_1"
      byType('aws_subnet').forEach((r: any) => {
        const m = /^(.+)_subnet$/.exec(r.name);
        if (m) subnetBaseByName.set(r.name, m[1]);
      });
  
      // Pré-cria nós de VPC existentes (mantém um por recurso)
      byType('aws_vpc').forEach((r: any) => {
        ensureVpcNode(r.name);
      });
  
      // -------------------------
      // EC2 ↔ VPC (via subnet_id)
      // -------------------------
      byType('aws_instance').forEach((inst: any) => {
        const ec2Idx = ensureEc2Node(inst.name);
        const subnetRef: string | undefined = inst?.properties?.subnet_id;
        const m = /\${aws_subnet\.([^}]+)\.id}/.exec(subnetRef || '');
        if (m) {
          const subnetName = m[1]; // ex: vpc_1_subnet
          const vpcBase = subnetBaseByName.get(subnetName);
          if (vpcBase) {
            const vpcIdx = ensureVpcNode(vpcBase);
            link(vpcIdx, ec2Idx, 'solid');
          }
        }
      });
  
      // -------------------------
      // ECS ↔ VPC (via service.network_configuration.subnets)
      // -------------------------
      const ecsBaseFrom = (name: string) => name.replace(/_(cluster|svc|task)$/, '');
  
      byType('aws_ecs_service').forEach((svc: any) => {
        const base = ecsBaseFrom(svc.name);
        const ecsIdx = ensureEcsNode(base);
  
        const net = svc?.properties?.network_configuration;
        const subnets = Array.isArray(net?.subnets) ? net.subnets : [];
        const firstRef = subnets.find((s: string) => typeof s === 'string' && s.includes('${aws_subnet.'));
        if (firstRef) {
          const m = /\${aws_subnet\.([^}]+)\.id}/.exec(firstRef);
          if (m) {
            const subnetName = m[1];
            const vpcBase = subnetBaseByName.get(subnetName);
            if (vpcBase) {
              const vpcIdx = ensureVpcNode(vpcBase);
              link(vpcIdx, ecsIdx, 'solid');
            }
          }
        }
      });
  
      // -------------------------
      // ECS ↔ DynamoDB (via env DYNAMO_TABLE da Task Definition)
      // -------------------------
      const taskByName = new Map<string, any>();
      byType('aws_ecs_task_definition').forEach((t: any) => taskByName.set(t.name, t));
  
      const ecsTaskByBase = new Map<string, any>();
      for (const [name, td] of taskByName.entries()) {
        const base = ecsBaseFrom(name);
        ecsTaskByBase.set(base, td);
      }
  
      ecsTaskByBase.forEach((td: any, base: string) => {
        // container_definitions é string JSON
        let containers: any[] = [];
        try {
          const raw = td?.properties?.container_definitions;
          if (typeof raw === 'string') containers = JSON.parse(raw);
        } catch { /* ignora json inválido */ }
  
        const envs = containers.flatMap(c => Array.isArray(c?.environment) ? c.environment : []);
        // procura env referenciando ${aws_dynamodb_table.<name>.name}
        const dynRef = envs
          .map((e: any) => e?.value)
          .find((v: any) => typeof v === 'string' && /\${aws_dynamodb_table\.([A-Za-z0-9_\-]+)\.name}/.test(v));
  
        if (dynRef) {
          const m = /\${aws_dynamodb_table\.([A-Za-z0-9_\-]+)\.name}/.exec(dynRef);
          if (m) {
            const dynName = m[1];
            const dynIdx = dynIndexByName.get(dynName);
            if (dynIdx !== undefined) {
              const ecsIdx = ensureEcsNode(base);
              link(ecsIdx, dynIdx, 'solid');
            }
          }
        }
      });
  
      // -------------------------
      // EC2 ↔ DynamoDB (heurística: quando há UMA única tabela e policy Dynamo associada)
      // -------------------------
      if (dynamoRes.length === 1) {
        const onlyDynName = dynamoRes[0]?.name;
        const onlyDynIdx = onlyDynName ? dynIndexByName.get(onlyDynName) : undefined;
  
        if (onlyDynIdx !== undefined) {
          const policies = byType('aws_iam_role_policy');
  
          const isDynamoPolicy = (pjson: any) => {
            try {
              const pol = typeof pjson === 'string' ? JSON.parse(pjson) : pjson;
              const stmts = Array.isArray(pol?.Statement) ? pol.Statement : [];
              return stmts.some((s: any) => {
                const acts = Array.isArray(s?.Action) ? s.Action : [s?.Action].filter(Boolean);
                return acts.some((a: string) => typeof a === 'string' && a.toLowerCase().startsWith('dynamodb:'));
              });
            } catch { return false; }
          };
  
          policies.forEach((p: any) => {
            if (!isDynamoPolicy(p?.properties?.policy)) return;
  
            // Nome no padrão do export: ec2_X_dynamo_policy
            const name: string = p.name || '';
            const m = /(ec2_[0-9]+)_/.exec(name);
            if (!m) return;
  
            const ec2Name = m[1]; // ex: ec2_1
            const ec2Idx = ensureEc2Node(ec2Name);
            link(ec2Idx, onlyDynIdx, 'solid');
          });
        }
      }
  
      // -------------------------
      // VPC ↔ DynamoDB (via aws_vpc_endpoint de serviço Dynamo) — liga só se houver 1 tabela
      // -------------------------
      if (dynamoRes.length === 1) {
        const onlyDynName = dynamoRes[0]?.name;
        const onlyDynIdx = onlyDynName ? dynIndexByName.get(onlyDynName) : undefined;
  
        if (onlyDynIdx !== undefined) {
          byType('aws_vpc_endpoint').forEach((ep: any) => {
            const svcName = (ep?.properties?.service_name || '').toString();
            if (!/dynamodb/i.test(svcName)) return;
  
            const vpcRef: string | undefined = ep?.properties?.vpc_id;
            const m = /\${aws_vpc\.([^}]+)\.id}/.exec(vpcRef || '');
            if (m) {
              const vpcBase = m[1];
              const vpcIdx = ensureVpcNode(vpcBase);
              link(vpcIdx, onlyDynIdx, 'dashed'); // dashed para diferenciar "endpoint"
            }
          });
        }
      }
    } catch {
      // reconstrução opcional: não bloqueia o load caso algo mude no HCL
    }
  
    // Por fim, notifica o grafo
    this.emitGraph();
  }
  /** Fallback de ícone por tipo – ajuste os paths se forem diferentes no seu projeto. */
  private defaultIconFor(type: string): string {
    const map: Record<string, string> = {
      dynamodb: '/icons/dynamo.png',
      glue:     '/icons/glue.png',
      ecs:      '/icons/ecs.png',
      ec2:      '/icons/ec2.png',
      vpc:      '/icons/vpc.png',
    };
    return map[type] ?? '';
  }
}
