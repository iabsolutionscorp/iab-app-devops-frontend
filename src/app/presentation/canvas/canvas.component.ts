import {
  Component,
  ElementRef,
  ViewChild,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDragDrop,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { fromEvent, Subscription } from 'rxjs';

interface ServiceNode {
  label: string;
  icon: string;
  x: number;
  y: number;
}

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements OnDestroy {
  @ViewChild('canvasRef', { static: true })
  canvasRef!: ElementRef<HTMLDivElement>;

  droppedServices: ServiceNode[] = [];

  private draggingIndex: number | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private subs = new Subscription();

  constructor(private ngZone: NgZone) {}

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  onDrop(event: CdkDragDrop<any>) {
    if (event.previousContainer === event.container) return;
    const mouseEvt = (event as any).event as MouseEvent;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = mouseEvt.clientX - rect.left;
    const y = mouseEvt.clientY - rect.top;
    const data = event.item.data;
    if (data) {
      this.droppedServices.push({ label: data.label, icon: data.icon, x, y });
    }
  }

  startNodeDrag(i: number, evt: MouseEvent) {
    evt.preventDefault();
    this.draggingIndex = i;

    const nodeRect = (evt.target as HTMLElement)
      .closest('.node')!
      .getBoundingClientRect();
    this.offsetX = evt.clientX - nodeRect.left;
    this.offsetY = evt.clientY - nodeRect.top;

    // registramos dentro da zona Angular para ter detecção de mudanças
    const moveSub = fromEvent<MouseEvent>(document, 'mousemove')
      .subscribe((m) => this.onNodeMove(m));
    const upSub = fromEvent<MouseEvent>(document, 'mouseup')
      .subscribe(() => this.endNodeDrag());

    this.subs.add(moveSub);
    this.subs.add(upSub);
  }

  private onNodeMove(evt: MouseEvent) {
    if (this.draggingIndex === null) return;
    // roda dentro da zona para disparar CD automaticamente
    this.ngZone.run(() => {
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      let x = evt.clientX - rect.left - this.offsetX;
      let y = evt.clientY - rect.top - this.offsetY;
      x = Math.max(0, Math.min(x, rect.width));
      y = Math.max(0, Math.min(y, rect.height));
      this.droppedServices[this.draggingIndex!] = {
        ...this.droppedServices[this.draggingIndex!],
        x,
        y,
      };
    });
  }

  private endNodeDrag() {
    this.draggingIndex = null;
    this.subs.unsubscribe();
    this.subs = new Subscription();
  }
}
