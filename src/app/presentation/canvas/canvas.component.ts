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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { fromEvent, Subscription } from 'rxjs';

interface ServiceNode {
  label: string;
  icon: string;
  x: number;
  y: number;
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
  private draggingIndex: number | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private subs = new Subscription();

  constructor(private ngZone: NgZone) {}
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
    this.droppedServices.push({
      label: data.label ?? (data as any).type ?? 'SERVICE',
      icon: data.icon ?? '',
      x, y
    });

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
    if ((evt.target as HTMLElement).classList.contains('port')) return; // não inicia drag se clicou na porta
    evt.preventDefault();

    this.draggingIndex = i;
    const nodeRect = (evt.target as HTMLElement).closest('.node')!.getBoundingClientRect();
    this.offsetX = evt.clientX - nodeRect.left;
    this.offsetY = evt.clientY - nodeRect.top;

    const moveSub = fromEvent<MouseEvent>(document, 'mousemove').subscribe(m => this.onNodeMove(m));
    const upSub   = fromEvent<MouseEvent>(document, 'mouseup').subscribe(() => this.endNodeDrag());
    this.subs.add(moveSub); this.subs.add(upSub);
  }

  private onNodeMove(evt: MouseEvent) {
    if (this.draggingIndex === null) return;

    this.ngZone.run(() => {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      let x = evt.clientX - rect.left - this.offsetX;
      let y = evt.clientY - rect.top - this.offsetY;
      x = Math.max(0, Math.min(x, rect.width));
      y = Math.max(0, Math.min(y, rect.height));

      this.droppedServices[this.draggingIndex!] = {
        ...this.droppedServices[this.draggingIndex!],
        x, y
      };
    });
  }

  private endNodeDrag() {
    this.draggingIndex = null;
    this.subs.unsubscribe();
    this.subs = new Subscription();
    // mover nó não altera o HCL (não emite)
  }

  // ===== Portas =====
  getPortXY(ref: PortRef): { x: number; y: number } {
    const nodeEl = this.nodeElems?.toArray()[ref.nodeIndex]?.nativeElement;
    if (!nodeEl) return { x: 0, y: 0 };

    const canvasRect = this.canvasRef.nativeElement.getBoundingClientRect();
    const rect = nodeEl.getBoundingClientRect();
    const midX = rect.left - canvasRect.left + rect.width / 2;
    const midY = rect.top  - canvasRect.top  + rect.height / 2;

    switch (ref.side) {
      case 'top':    return { x: midX, y: rect.top    - canvasRect.top };
      case 'right':  return { x: rect.right - canvasRect.left, y: midY };
      case 'bottom': return { x: midX, y: rect.bottom - canvasRect.top };
      case 'left':   return { x: rect.left  - canvasRect.left, y: midY };
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

  private normalizeType(label: string): string {
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
        access_key: 'test',
        secret_key: 'test',
        region: 'us-east-1',
        s3_force_path_style: true,
        skip_credentials_validation: true,
        skip_metadata_api_check: true,
        skip_requesting_account_id: true,
        endpoints: {
          s3: '${var.localstack_endpoint}',
          dynamodb: '${var.localstack_endpoint}',
          glue: '${var.localstack_endpoint}',
          iam: '${var.localstack_endpoint}',
          sts: '${var.localstack_endpoint}',
        }
      }
    });
  
    // -------------------------
    // DynamoDB tables
    // -------------------------
    const dynamoNodes = nodes.filter(n => n.type === 'dynamodb');
    dynamoNodes.forEach((n, i) => {
      const name = `dynamo_${i + 1}`;
      resources.push({
        type: 'aws_dynamodb_table',
        name,
        properties: {
          name: name,
          billing_mode: 'PAY_PER_REQUEST',
          hash_key: 'id'
        },
        blocks: [{ name: 'attribute', body: { name: 'id', type: 'S' } }]
      });
    });
  
    // -------------------------
    // Glue base (se houver Glue)
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
    // Crawler para cada Glue <-> Dynamo
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
  public loadFromConfig(config: any) {
    // limpa
    this.droppedServices = [];
    this.connections = [];
    this.portConnections = [];
    this.drawMode = false;
    this.deleteMode = false;
    this.serviceDeleteMode = false;
    this.lineStyle = null;
    this.portDraft = { from: null };

    const resources = Array.isArray(config?.resources) ? config.resources : [];

    // DynamoDB -> nós
    const dynamoRes = resources.filter((r: any) => r.type === 'aws_dynamodb_table');
    const dynIndexByName = new Map<string, number>();

    // cria 1 nó Glue se houver qualquer coisa de Glue
    const hasGlue =
      resources.some((r: any) => r.type === 'aws_glue_crawler') ||
      resources.some((r: any) => r.type === 'aws_glue_catalog_database') ||
      resources.some((r: any) => r.type === 'aws_iam_role');

    let glueIndex: number | null = null;
    if (hasGlue) {
      this.droppedServices.push({ label: 'Glue', icon: '', x: 200, y: 200 });
      glueIndex = 0;
    }

    // posicionar os Dynamo à direita do Glue
    const startX = hasGlue ? 460 : 200;
    let dx = startX;
    const y = 200;

    dynamoRes.forEach((r: any, i: number) => {
      const nodeLabel = 'Dynamo';
      this.droppedServices.push({ label: nodeLabel, icon: '', x: dx, y });
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
      // espera: "${aws_dynamodb_table.dynamo_X.name}" -> extrai o identificador
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

    // notifica quem escuta
    this.emitGraph();
  }
}
