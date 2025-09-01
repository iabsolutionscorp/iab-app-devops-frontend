import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';

type LineStyle = 'solid' | 'dashed';
type PortSide = 'top' | 'right' | 'bottom' | 'left';

interface DroppedService {
  x: number;
  y: number;
  label: string;
  icon: string;
  parentId?: string | null; // para VPC
}

interface PortRef {
  node: number;
  side: PortSide;
}

interface PortConnection {
  source: PortRef;
  target: PortRef;
  style: LineStyle; // cada conexão tem seu estilo próprio
}

type VpcHandle =
  | 'n' | 's' | 'e' | 'w'
  | 'ne' | 'nw' | 'se' | 'sw';

interface VpcBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit {
  @ViewChild('canvasRef', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('viewportRef', { static: true }) viewportRef!: ElementRef<HTMLDivElement>;

  // Pan/zoom
  scale = 1;
  panX = 0;
  panY = 0;

  // Dados
  droppedServices: DroppedService[] = [];
  vpcs: VpcBox[] = [];
  portConnections: PortConnection[] = [];

  // Estilos/modos
  lineStyle: LineStyle = 'solid';   // estilo padrão para novas conexões
  deleteMode = false;               // tesoura
  serviceDeleteMode = false;

  // Link em progresso
  linkingFrom: PortRef | null = null;
  mouseWorldX = 0;
  mouseWorldY = 0;

  // Drag de node
  private draggingNodeIndex: number | null = null;
  private dragStart = { x: 0, y: 0, nodeX: 0, nodeY: 0, vpcX: 0, vpcY: 0, vpcW: 0, vpcH: 0 };
  private spacePressed = false;

  readonly NODE_W = 108;
  readonly NODE_H = 96;

  // --- VPC state ---
  private draggingVpcIndex: number | null = null;
  private resizingVpcIndex: number | null = null;
  private resizingHandle: VpcHandle | null = null;
  private vpcResizeChildrenSnapshot: Array<{ index: number; x: number; y: number }> = [];

  get transform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }
  get transformOrigin(): string { return '0 0'; }

  ngAfterViewInit(): void {
    const W = 8000, H = 8000;
    this.panX = -(W - window.innerWidth) / 2;
    this.panY = -(H - window.innerHeight) / 2;
  }

  /* ================= ZOOM / PAN ================= */
  zoomIn(): void  { this.scale = Math.min(this.scale * 1.1, 3); }
  zoomOut(): void { this.scale = Math.max(this.scale / 1.1, 0.2); }
  resetView(): void { this.scale = 1; this.panX = 0; this.panY = 0; }
  fitToScreen(): void { this.resetView(); }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') this.spacePressed = true;
    if ((e.ctrlKey || e.metaKey) && e.key === '+') { e.preventDefault(); this.zoomIn(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); this.zoomOut(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); this.resetView(); }
    if (e.code === 'Escape') this.cancelLinking();
    if (e.code === 'KeyE') this.toggleServiceDeleteMode();
  }
  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') this.spacePressed = false;
  }

  onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const d = Math.sign(ev.deltaY);
    d > 0 ? this.zoomOut() : this.zoomIn();
  }

  onPointerDown(ev: PointerEvent): void {
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    if (this.spacePressed) {
      this.dragStart.x = ev.clientX;
      this.dragStart.y = ev.clientY;
    }
  }

  onPointerMove(ev: PointerEvent): void {
    const pt = this.toWorld(ev.clientX, ev.clientY);
    this.mouseWorldX = pt.x;
    this.mouseWorldY = pt.y;

    if (this.spacePressed && (ev.buttons & 1)) {
      this.panX += ev.clientX - this.dragStart.x;
      this.panY += ev.clientY - this.dragStart.y;
      this.dragStart.x = ev.clientX;
      this.dragStart.y = ev.clientY;
      return;
    }

    // Drag VPC — agora os filhos NÃO são movidos
    if (this.draggingVpcIndex !== null) {
      const pt2 = this.toWorld(ev.clientX, ev.clientY);
      const dx = pt2.x - this.dragStart.x;
      const dy = pt2.y - this.dragStart.y;
      const v = this.vpcs[this.draggingVpcIndex];
      v.x = this.dragStart.vpcX + dx;
      v.y = this.dragStart.vpcY + dy;
      return;
    }

    // Resize VPC — filhos ficam parados (snapshot)
    if (this.resizingVpcIndex !== null && this.resizingHandle) {
      const pt2 = this.toWorld(ev.clientX, ev.clientY);
      const v = this.vpcs[this.resizingVpcIndex];
      let x = this.dragStart.vpcX;
      let y = this.dragStart.vpcY;
      let w = this.dragStart.vpcW;
      let h = this.dragStart.vpcH;
      const dx = pt2.x - this.dragStart.x;
      const dy = pt2.y - this.dragStart.y;
      const minW = 200, minH = 140;

      switch (this.resizingHandle) {
        case 'e': w = Math.max(minW, this.dragStart.vpcW + dx); break;
        case 's': h = Math.max(minH, this.dragStart.vpcH + dy); break;
        case 'w':
          x = Math.min(this.dragStart.vpcX + this.dragStart.vpcW - minW, this.dragStart.vpcX + dx);
          w = Math.max(minW, this.dragStart.vpcW - dx);
          break;
        case 'n':
          y = Math.min(this.dragStart.vpcY + this.dragStart.vpcH - minH, this.dragStart.vpcY + dy);
          h = Math.max(minH, this.dragStart.vpcH - dy);
          break;
        case 'ne':
          y = Math.min(this.dragStart.vpcY + this.dragStart.vpcH - minH, this.dragStart.vpcY + dy);
          h = Math.max(minH, this.dragStart.vpcH - dy);
          w = Math.max(minW, this.dragStart.vpcW + dx);
          break;
        case 'nw':
          x = Math.min(this.dragStart.vpcX + this.dragStart.vpcW - minW, this.dragStart.vpcX + dx);
          w = Math.max(minW, this.dragStart.vpcW - dx);
          y = Math.min(this.dragStart.vpcY + this.dragStart.vpcH - minH, this.dragStart.vpcY + dy);
          h = Math.max(minH, this.dragStart.vpcH - dy);
          break;
        case 'se':
          w = Math.max(minW, this.dragStart.vpcW + dx);
          h = Math.max(minH, this.dragStart.vpcH + dy);
          break;
        case 'sw':
          x = Math.min(this.dragStart.vpcX + this.dragStart.vpcW - minW, this.dragStart.vpcX + dx);
          w = Math.max(minW, this.dragStart.vpcW - dx);
          h = Math.max(minH, this.dragStart.vpcH + dy);
          break;
      }
      v.x = x; v.y = y; v.w = w; v.h = h;

      // manter filhos estáticos durante o resize
      if (this.vpcResizeChildrenSnapshot.length) {
        for (const snap of this.vpcResizeChildrenSnapshot) {
          const n = this.droppedServices[snap.index];
          if (n) { n.x = snap.x; n.y = snap.y; }
        }
      }
      return;
    }

    // Drag de nó
    if (this.draggingNodeIndex !== null) {
      const i = this.draggingNodeIndex;
      this.droppedServices[i].x = this.dragStart.nodeX + (pt.x - this.dragStart.x);
      this.droppedServices[i].y = this.dragStart.nodeY + (pt.y - this.dragStart.y);
    }
  }

  onPointerUp(_: PointerEvent): void {
    // fim do drag da VPC: recalcular pertença dos nós por centro
    if (this.draggingVpcIndex !== null) {
      const v = this.vpcs[this.draggingVpcIndex];
      for (const n of this.droppedServices) {
        const cx = n.x, cy = n.y;
        if (this.isPointInsideVpc(v, cx, cy)) {
          n.parentId = v.id;
        } else if (n.parentId === v.id) {
          n.parentId = null;
        }
      }
      this.draggingVpcIndex = null;
    }

    // fim do resize da VPC
    if (this.resizingVpcIndex !== null) {
      const v = this.vpcs[this.resizingVpcIndex];

      // ejetar nós cujo centro ficou fora da VPC
      for (const n of this.droppedServices) {
        if (n.parentId === v.id) {
          const cx = n.x;
          const cy = n.y;
          if (!this.isPointInsideVpc(v, cx, cy)) n.parentId = null;
        }
      }

      this.resizingVpcIndex = null;
      this.resizingHandle = null;
      this.vpcResizeChildrenSnapshot = [];
    }

    // finalizar drag de nó → reatribuir parent por centro
    if (this.draggingNodeIndex !== null) {
      const i = this.draggingNodeIndex;
      const n = this.droppedServices[i];
      const v = this.topmostVpcUnderPoint(n.x, n.y);
      n.parentId = v ? v.id : null;
    }

    this.draggingNodeIndex = null;
  }

  /* ================= PALETA / DROP ================= */
  onDrop(event: CdkDragDrop<any>): void {
    const data = event.item?.data;
    if (!data) return;
    // @ts-ignore
    const dp = event.dropPoint ?? { x: event?.event?.clientX, y: event?.event?.clientY };
    const pt = this.toWorld(dp.x, dp.y);

    // VPC
    if ((data.label ?? '').toUpperCase() === 'VPC') {
      this.vpcs.push({
        id: this.genId('vpc'),
        x: pt.x - 200,
        y: pt.y - 120,
        w: 400,
        h: 240,
        label: data.label || 'VPC',
      });
      return;
    }

    // Service
    const node: DroppedService = {
      x: pt.x, y: pt.y,
      label: data.label ?? 'Service',
      icon: data.icon ?? 'assets/icon.png',
      parentId: null,
    };
    const vpc = this.topmostVpcUnderPoint(node.x, node.y);
    if (vpc) node.parentId = vpc.id;
    this.droppedServices.push(node);
  }

  /* ================= LIGAÇÕES ================= */
  onPortClick(node: number, side: PortSide, ev: MouseEvent): void {
    ev.stopPropagation();
    const port: PortRef = { node, side };

    // cancelar se clicar na mesma porta
    if (this.linkingFrom && this.linkingFrom.node === node && this.linkingFrom.side === side) {
      this.cancelLinking(); return;
    }

    // finalizar se já há origem
    if (this.linkingFrom) {
      this.portConnections.push({ source: this.linkingFrom, target: port, style: this.lineStyle });
      this.linkingFrom = null;
      return;
    }

    // iniciar
    this.linkingFrom = port;
  }
  cancelLinking(): void { this.linkingFrom = null; }
  onPortLineClick(index: number): void { if (this.deleteMode) this.portConnections.splice(index, 1); }

  toggleSolidMode(): void  { this.lineStyle = 'solid'; }
  toggleDashedMode(): void { this.lineStyle = 'dashed'; }
  toggleDeleteMode(): void { this.deleteMode = !this.deleteMode; }
  toggleServiceDeleteMode(): void { this.serviceDeleteMode = !this.serviceDeleteMode; }

  /* ================= DRAG NODE ================= */
  startNodeDrag(i: number, ev: MouseEvent): void {
    ev.stopPropagation();
    const pt = this.toWorld(ev.clientX, ev.clientY);
    this.draggingNodeIndex = i;
    this.dragStart.x = pt.x;
    this.dragStart.y = pt.y;
    this.dragStart.nodeX = this.droppedServices[i].x;
    this.dragStart.nodeY = this.droppedServices[i].y;
  }

  onServiceClick(i: number, ev: MouseEvent): void {
    ev.stopPropagation();
    if (!this.serviceDeleteMode) return;

    // remove conexões com este nó e reindexa
    this.portConnections = this.portConnections.filter(pc => pc.source.node !== i && pc.target.node !== i);
    this.droppedServices.splice(i, 1);
    this.portConnections.forEach(pc => {
      if (pc.source.node > i) pc.source.node -= 1;
      if (pc.target.node > i) pc.target.node -= 1;
    });
  }

  /* ================= VPC helpers ================= */
  private genId(prefix = 'id'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  private isPointInsideVpc(v: VpcBox, x: number, y: number): boolean {
    return x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h;
  }
  private topmostVpcUnderPoint(x: number, y: number): VpcBox | null {
    for (let i = this.vpcs.length - 1; i >= 0; i--) {
      const v = this.vpcs[i];
      if (this.isPointInsideVpc(v, x, y)) return v;
    }
    return null;
  }

  private getChildrenOfVpc(vpcId: string): number[] {
    const idxs: number[] = [];
    for (let i = 0; i < this.droppedServices.length; i++) {
      if (this.droppedServices[i].parentId === vpcId) idxs.push(i);
    }
    return idxs;
  }

  startVpcDrag(i: number, ev: MouseEvent): void {
    ev.stopPropagation();
    this.bringVpcToFront(i); // z-order correto mesmo com pointer-events none no wrapper
    const pt = this.toWorld(ev.clientX, ev.clientY);
    this.draggingVpcIndex = i;
    this.dragStart.x = pt.x;
    this.dragStart.y = pt.y;
    this.dragStart.vpcX = this.vpcs[i].x;
    this.dragStart.vpcY = this.vpcs[i].y;
  }

  bringVpcToFront(i: number): void {
    const v = this.vpcs.splice(i, 1)[0];
    this.vpcs.push(v);
  }

  startVpcResize(i: number, handle: VpcHandle, ev: MouseEvent): void {
    ev.stopPropagation();
    this.bringVpcToFront(i); // idem
    const pt = this.toWorld(ev.clientX, ev.clientY);
    this.resizingVpcIndex = i;
    this.resizingHandle = handle;
    this.dragStart.x = pt.x;
    this.dragStart.y = pt.y;
    this.dragStart.vpcX = this.vpcs[i].x;
    this.dragStart.vpcY = this.vpcs[i].y;
    this.dragStart.vpcW = this.vpcs[i].w;
    this.dragStart.vpcH = this.vpcs[i].h;

    // snapshot das posições dos filhos (ficam parados durante o resize)
    this.vpcResizeChildrenSnapshot = [];
    const v = this.vpcs[i];
    for (let idx = 0; idx < this.droppedServices.length; idx++) {
      const n = this.droppedServices[idx];
      if (n.parentId === v.id) {
        this.vpcResizeChildrenSnapshot.push({ index: idx, x: n.x, y: n.y });
      }
    }
  }

  /* ================= UTILS ================= */
  getPortXY(ref: PortRef): { x: number; y: number } {
    const n = this.droppedServices[ref.node];
    if (!n) return { x: 0, y: 0 };
    switch (ref.side) {
      case 'top':    return { x: n.x,                   y: n.y - this.NODE_H / 2 };
      case 'bottom': return { x: n.x,                   y: n.y + this.NODE_H / 2 };
      case 'left':   return { x: n.x - this.NODE_W / 2, y: n.y };
      case 'right':  return { x: n.x + this.NODE_W / 2, y: n.y };
    }
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.scale;
    const y = (clientY - rect.top  - this.panY) / this.scale;
    return { x, y };
  }

  clearAll(): void {
    this.droppedServices = [];
    this.vpcs = [];
    this.portConnections = [];
    this.resetView();
  }

  exportConfig(): any {
    return {
      scale: this.scale, panX: this.panX, panY: this.panY,
      style: this.lineStyle,
      nodes: this.droppedServices,
      vpcs: this.vpcs,
      portConnections: this.portConnections,
    };
  }
  loadFromConfig(cfg: any): void { this.importConfig(cfg); }

  importConfig(cfg: any): void {
    if (!cfg) return;
    this.scale = Number(cfg.scale) || 1;
    this.panX  = Number(cfg.panX)  || 0;
    this.panY  = Number(cfg.panY)  || 0;
    this.lineStyle = (cfg.style as LineStyle) || 'solid';

    // VPCs
    if (Array.isArray(cfg.vpcs)) {
      this.vpcs = cfg.vpcs.map((v: any) => ({
        id: String(v.id ?? this.genId('vpc')),
        x: Number(v.x) || 0, y: Number(v.y) || 0,
        w: Number(v.w) || 400, h: Number(v.h) || 240,
        label: String(v.label ?? 'VPC'),
      }));
    } else {
      this.vpcs = [];
    }

    // Nodes
    this.droppedServices = (cfg.nodes ?? []).map((n: any) => ({
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      label: String(n.label ?? ''),
      icon: String(n.icon ?? ''),
      parentId: n.parentId ?? null,
    }));

    // Conexões
    this.portConnections = (cfg.portConnections ?? []).map((pc: any) => ({
      source: pc.source as PortRef,
      target: pc.target as PortRef,
      style: (pc.style as LineStyle) || 'solid'
    }));
  }
}
