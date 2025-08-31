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
}

interface PortRef {
  node: number;
  side: PortSide;
}

interface PortConnection {
  source: PortRef;
  target: PortRef;
  style: LineStyle;
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
  portConnections: PortConnection[] = [];

  // Estilos/modos
  lineStyle: LineStyle = 'solid';
  deleteMode = false;
  serviceDeleteMode = false;

  // Link em progresso (preview)
  linkingFrom: PortRef | null = null;
  mouseWorldX = 0;
  mouseWorldY = 0;

  // Drag de node
  private draggingNodeIndex: number | null = null;
  private dragStart = { x: 0, y: 0, nodeX: 0, nodeY: 0 };
  private spacePressed = false;

  // card size (centro como origem)
  readonly NODE_W = 108;
  readonly NODE_H = 96;

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

  /* ================= POINTER ================= */
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

    if (this.draggingNodeIndex !== null) {
      const i = this.draggingNodeIndex;
      this.droppedServices[i].x = this.dragStart.nodeX + (pt.x - this.dragStart.x);
      this.droppedServices[i].y = this.dragStart.nodeY + (pt.y - this.dragStart.y);
    }
  }

  onPointerUp(_: PointerEvent): void {
    this.draggingNodeIndex = null;
  }

  /* ================= PALETA / DROP ================= */
  onDrop(event: CdkDragDrop<any>): void {
    const data = event.item?.data;
    if (!data) return;
    // @ts-ignore
    const dp = event.dropPoint ?? { x: event?.event?.clientX, y: event?.event?.clientY };
    const pt = this.toWorld(dp.x, dp.y);
    this.droppedServices.push({
      x: pt.x, y: pt.y,
      label: data.label ?? 'Service',
      icon: data.icon ?? 'assets/icon.png'
    });
  }

  /* ================= LIGAÇÕES SIMPLES ================= */
  onPortClick(node: number, side: PortSide, ev: MouseEvent): void {
    ev.stopPropagation();
    const port: PortRef = { node, side };

    // Se clicar na mesma porta novamente → cancela
    if (this.linkingFrom && this.linkingFrom.node === node && this.linkingFrom.side === side) {
      this.cancelLinking();
      return;
    }

    // Se não existe origem -> começa
    if (!this.linkingFrom) {
      this.linkingFrom = port;
      return;
    }

    // Se já existe origem -> finaliza
    this.portConnections.push({
      source: this.linkingFrom,
      target: port,
      style: this.lineStyle,
    });
    this.linkingFrom = null;
  }

  cancelLinking(): void { this.linkingFrom = null; }

  onPortLineClick(index: number): void {
    if (this.deleteMode) this.portConnections.splice(index, 1);
  }

  toggleSolidMode(): void  { this.lineStyle = 'solid'; }
  toggleDashedMode(): void { this.lineStyle = 'dashed'; }
  toggleDeleteMode(): void { this.deleteMode = !this.deleteMode; }
  toggleServiceDeleteMode(): void { this.serviceDeleteMode = !this.serviceDeleteMode; }

  startNodeDrag(i: number, ev: MouseEvent): void {
    ev.stopPropagation();
    const pt = this.toWorld(ev.clientX, ev.clientY);
    this.draggingNodeIndex = i;
    this.dragStart = { x: pt.x, y: pt.y, nodeX: this.droppedServices[i].x, nodeY: this.droppedServices[i].y };
  }

  onServiceClick(i: number, ev: MouseEvent): void {
    ev.stopPropagation();
    if (!this.serviceDeleteMode) return;

    // apaga conexões do serviço
    this.portConnections = this.portConnections.filter(pc => pc.source.node !== i && pc.target.node !== i);
    // remove serviço e reindexa
    this.droppedServices.splice(i, 1);
    this.portConnections = this.portConnections.map(pc => ({
      source: { node: pc.source.node > i ? pc.source.node - 1 : pc.source.node, side: pc.source.side },
      target: { node: pc.target.node > i ? pc.target.node - 1 : pc.target.node, side: pc.target.side },
      style: pc.style,
    }));
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
    this.portConnections = [];
    this.resetView();
  }
  exportConfig(): any {
    return {
      scale: this.scale, panX: this.panX, panY: this.panY,
      style: this.lineStyle,
      nodes: this.droppedServices,
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
    this.droppedServices = (cfg.nodes ?? []).map((n: any) => ({
      x: Number(n.x) || 0, y: Number(n.y) || 0, label: String(n.label ?? ''), icon: String(n.icon ?? '')
    }));
    this.portConnections = (cfg.portConnections ?? []).map((pc: any) => ({
      source: pc.source as PortRef, target: pc.target as PortRef, style: (pc.style as LineStyle) || 'solid'
    }));
  }
}
