import {
  Component,
  ElementRef,
  NgZone,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';

type PortSide = 'top' | 'right' | 'bottom' | 'left';

interface NodeView {
  id: string;
  type: string;
  label: string;
  icon?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PortRef {
  nodeIndex: number;
  side: PortSide;
}

interface PortConnection {
  source: PortRef;
  target: PortRef;
  style: 'dashed' | 'solid';
}

interface FreeConnection {
  x1: number; y1: number;
  x2: number; y2: number;
  style: 'dashed' | 'solid';
}

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChildren('nodeRef') nodeElems!: QueryList<ElementRef<HTMLDivElement>>;

  // Se o seu palette tiver outro id, troque aqui:
  connectedDropLists: string[] = ['palette-drop'];

  nodes: NodeView[] = [];
  connections: FreeConnection[] = [];

  portConnections: PortConnection[] = [];
  portDraft: { from: PortRef | null; toXY?: { x: number; y: number } } = { from: null };

  lineStyle: 'dashed' | 'solid' = 'solid';
  deleteMode = false;

  constructor(private ngZone: NgZone) {}

  /** compatibilidade com workspace.component.ts */
  clearAll(): void {
    this.connections = [];
    this.portConnections = [];
    this.nodes = [];
  }

  private genId(p = 'n'): string {
    return `${p}_${Math.random().toString(36).slice(2, 9)}`;
  }

  addNode(partial: Partial<NodeView>) {
    const node: NodeView = {
      id: this.genId('node'),
      type: partial.type ?? 'service',
      label: partial.label ?? (partial.type ?? 'service').toUpperCase(),
      icon: partial.icon,
      x: partial.x ?? 120,
      y: partial.y ?? 120,
      width: partial.width ?? 64,
      height: partial.height ?? 64,
    };
    this.nodes = [...this.nodes, node];
  }

  // ===== CDK Drop: soltar do palette no canvas =====
  onDrop(event: CdkDragDrop<any>) {
    const canvasRect = this.canvasRef.nativeElement.getBoundingClientRect();

    // posição do ponteiro (várias versões do CDK)
    const clientX =
      (event as any).dropPoint?.x ??
      (event as any).event?.clientX ??
      (event as any).pointerPosition?.x ??
      0;
    const clientY =
      (event as any).dropPoint?.y ??
      (event as any).event?.clientY ??
      (event as any).pointerPosition?.y ??
      0;

    const size = 64;
    const x = Math.max(0, clientX - canvasRect.left - size / 2);
    const y = Math.max(0, clientY - canvasRect.top - size / 2);

    // dados do item arrastado (string ou objeto)
    let type = 'service';
    let label = 'SERVICE';
    let icon: string | undefined;

    if (typeof event.item.data === 'string') {
      type = event.item.data;
      label = type.toUpperCase();
    } else if (event.item.data && typeof event.item.data === 'object') {
      type = event.item.data.type ?? type;
      label = event.item.data.label ?? type.toUpperCase();
      icon = event.item.data.icon ?? undefined;
    } else {
      // fallback: tenta dataset do elemento
      const el: any = event.item.element?.nativeElement;
      const ds = el?.dataset ?? {};
      type = ds.type ?? type;
      label = ds.label ?? type.toUpperCase();
      icon = ds.icon ?? undefined;
    }

    this.addNode({ type, label, icon, x, y, width: size, height: size });
  }

  // ===== Drag do nó (interno ao canvas) =====
  private draggingIndex: number | null = null;
  private dragOffset = { x: 0, y: 0 };

  startDragNode(i: number, ev: PointerEvent) {
    if ((ev.target as HTMLElement).classList.contains('port')) return;
    this.draggingIndex = i;
    const el = this.nodeElems.toArray()[i].nativeElement;
    this.dragOffset = { x: ev.clientX - el.offsetLeft, y: ev.clientY - el.offsetTop };
    el.setPointerCapture(ev.pointerId);
  }

  onDocPointerMove(ev: PointerEvent) {
    if (this.draggingIndex === null) return;
    const i = this.draggingIndex;
    const x = ev.clientX - this.dragOffset.x;
    const y = ev.clientY - this.dragOffset.y;
    const n = { ...this.nodes[i], x, y };
    const copy = this.nodes.slice();
    copy[i] = n;
    this.nodes = copy;
  }

  onDocPointerUp() {
    this.draggingIndex = null;
  }

  // ===== Portas =====
  getPortXY(ref: PortRef): { x: number; y: number } {
    const nodeEl = this.nodeElems?.toArray()[ref.nodeIndex]?.nativeElement;
    if (!nodeEl) return { x: 0, y: 0 };

    const canvasRect = this.canvasRef.nativeElement.getBoundingClientRect();
    const rect = nodeEl.getBoundingClientRect();
    const midX = rect.left - canvasRect.left + rect.width / 2;
    const midY = rect.top - canvasRect.top + rect.height / 2;

    switch (ref.side) {
      case 'top':    return { x: midX, y: rect.top - canvasRect.top };
      case 'right':  return { x: rect.right - canvasRect.left, y: midY };
      case 'bottom': return { x: midX, y: rect.bottom - canvasRect.top };
      case 'left':   return { x: rect.left - canvasRect.left, y: midY };
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
    if (from.nodeIndex === target.nodeIndex && from.side === target.side) {
      this.portDraft = { from: null };
      return;
    }

    const style: 'dashed' | 'solid' = this.lineStyle ?? 'solid';
    this.portConnections = [
      ...this.portConnections,
      { source: from, target, style },
    ];
    this.portDraft = { from: null };
  }

  onCanvasMouseMove(ev: MouseEvent) {
    if (!this.portDraft.from) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.portDraft = {
      ...this.portDraft,
      toXY: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
    };
  }

  onCanvasMouseLeave() {
    this.portDraft = { from: null };
  }

  onPortLineClick(index: number) {
    if (!this.deleteMode) return;
    this.portConnections = this.portConnections.filter((_, i) => i !== index);
  }

  // ===== Linhas “livres” antigas =====
  onCanvasClick(_: MouseEvent) {
    // vazio de propósito (não conflitar com portas)
  }

  onLineClick(index: number) {
    if (!this.deleteMode) return;
    const copy = this.connections.slice();
    copy.splice(index, 1);
    this.connections = copy;
  }
}
