import { Component, ViewChild, ElementRef } from '@angular/core';
import { TopbarComponent } from '../topbar/topbar.component';
import { ServicePaletteComponent } from '../service-palette/service-palette.component';
import { CanvasComponent } from '../canvas/canvas.component';
import { TerraformPreviewComponent } from '../terraform-preview/terraform-preview.component';
import { fromEvent, Subscription } from 'rxjs';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [TopbarComponent, ServicePaletteComponent, CanvasComponent, TerraformPreviewComponent],
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.css']
})
export class WorkspaceComponent {
  projectName = 'novo projeto';
  @ViewChild('canvas') canvas!: CanvasComponent;

  // refs p/ resize
  @ViewChild('mainContent', { static: true }) mainContent!: ElementRef<HTMLDivElement>;
  @ViewChild('terraformPane', { static: true }) terraformPane!: ElementRef<HTMLDivElement>;

  terraformJson: any = {};

  // === redimensionar painel direito ===
  private resizing = false;
  private moveSub?: Subscription;
  private upSub?: Subscription;

  startResize(e: MouseEvent) {
    e.preventDefault();
    this.resizing = true;
    this.moveSub = fromEvent<MouseEvent>(document, 'mousemove').subscribe(ev => this.onResizing(ev));
    this.upSub = fromEvent<MouseEvent>(document, 'mouseup').subscribe(() => this.stopResize());
  }

  private onResizing(ev: MouseEvent) {
    if (!this.resizing) return;
    const container = this.mainContent.nativeElement.getBoundingClientRect();
    // largura desejada da coluna direita = distância até a borda direita
    let newWidth = container.right - ev.clientX;
    const min = 340;                                // mínimo painel direito
    const minCanvas = 420;                          // mínimo canvas à esquerda
    const max = Math.min(container.width - minCanvas, 900);
    newWidth = Math.max(min, Math.min(newWidth, max));
    this.terraformPane.nativeElement.style.width = `${newWidth}px`;
  }

  private stopResize() {
    this.resizing = false;
    this.moveSub?.unsubscribe();
    this.upSub?.unsubscribe();
  }

  onNewArchitecture() {
    this.canvas.clearAll();
    this.projectName = 'novo projeto';
    this.terraformJson = {};
  }

  onProjectNameChange(newName: string) {
    this.projectName = newName;
  }

  onLiveConfig(config: any) {
    this.terraformJson = config || {};
    this.canvas.loadFromConfig(this.terraformJson);
  }
}
