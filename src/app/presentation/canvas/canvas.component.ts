import {
  Component,
  ElementRef,
  ViewChild,
  ViewChildren,
  QueryList,
  NgZone,
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDragDrop,
  DragDropModule
} from '@angular/cdk/drag-drop';
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

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasRef', { static: true })
  canvasRef!: ElementRef<HTMLDivElement>;

  @ViewChildren('nodeElem', { read: ElementRef })
  nodeElems!: QueryList<ElementRef<HTMLDivElement>>;

  // Nós soltos no canvas
  droppedServices: ServiceNode[] = [];

  // Conexões desenhadas
  connections: Connection[] = [];

  // Modos mutuamente exclusivos
  drawMode = false;
  deleteMode = false;
  lineStyle: 'dashed' | 'solid' | null = null;
  private drawStartPoint: { x: number; y: number } | null = null;

  // Drag interno de nós
  private draggingIndex: number | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private subs = new Subscription();

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {}
  ngOnDestroy() { this.subs.unsubscribe(); }

  /** Ativa/desativa modo TRACEJADO */
  toggleDashedMode() {
    if (this.drawMode && this.lineStyle === 'dashed') {
      this.drawMode = false;
      this.lineStyle = null;
    } else {
      this.drawMode = true;
      this.deleteMode = false;
      this.lineStyle = 'dashed';
      this.drawStartPoint = null;
    }
  }

  /** Ativa/desativa modo SÓLIDO */
  toggleSolidMode() {
    if (this.drawMode && this.lineStyle === 'solid') {
      this.drawMode = false;
      this.lineStyle = null;
    } else {
      this.drawMode = true;
      this.deleteMode = false;
      this.lineStyle = 'solid';
      this.drawStartPoint = null;
    }
  }

  /** Ativa/desativa modo EXCLUSÃO */
  toggleDeleteMode() {
    this.deleteMode = !this.deleteMode;
    if (this.deleteMode) {
      this.drawMode = false;
      this.lineStyle = null;
    }
  }

  /** Clique no canvas para desenhar linha */
  onCanvasClick(evt: MouseEvent) {
    if (!this.drawMode || !this.lineStyle) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (!this.drawStartPoint) {
      this.drawStartPoint = { x, y };
    } else {
      this.connections.push({
        x1: this.drawStartPoint.x,
        y1: this.drawStartPoint.y,
        x2: x,
        y2: y,
        style: this.lineStyle
      });
      this.drawStartPoint = null;
    }
  }

  /** Apaga a linha clicada (apenas em deleteMode) */
  onLineClick(idx: number) {
    if (!this.deleteMode) return;
    this.connections.splice(idx, 1);
  }

  /** Solta serviço do palette no canvas */
  onDrop(event: CdkDragDrop<any>) {
    if (event.previousContainer === event.container) return;
    const mouseEvt = (event as any).event as MouseEvent;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = mouseEvt.clientX - rect.left;
    const y = mouseEvt.clientY - rect.top;
    const data = event.item.data as ServiceNode;
    this.droppedServices.push({ ...data, x, y });
  }

  /** Inicia drag manual de um nó */
  startNodeDrag(i: number, evt: MouseEvent) {
    evt.preventDefault();
    this.draggingIndex = i;
    const nodeRect = (evt.target as HTMLElement)
      .closest('.node')!
      .getBoundingClientRect();
    this.offsetX = evt.clientX - nodeRect.left;
    this.offsetY = evt.clientY - nodeRect.top;

    const moveSub = fromEvent<MouseEvent>(document, 'mousemove')
      .subscribe(m => this.onNodeMove(m));
    const upSub = fromEvent<MouseEvent>(document, 'mouseup')
      .subscribe(() => this.endNodeDrag());

    this.subs.add(moveSub);
    this.subs.add(upSub);
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
  }
}
