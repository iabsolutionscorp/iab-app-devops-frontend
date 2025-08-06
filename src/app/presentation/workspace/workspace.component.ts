import { Component, ViewChild } from '@angular/core';
import { ServicePaletteComponent } from '../service-palette/service-palette.component';
import { CanvasComponent } from '../canvas/canvas.component';
import { TerraformPreviewComponent } from '../terraform-preview/terraform-preview.component';
import { TopbarComponent } from '../topbar/topbar.component';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    TopbarComponent,
    ServicePaletteComponent,
    CanvasComponent,
    TerraformPreviewComponent
  ],
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.css']
})
export class WorkspaceComponent {
  /** Pega a instância do Canvas para poder resetar tudo */
  @ViewChild('canvas') canvas!: CanvasComponent;

  /** Chamado quando o Topbar emite newArchitecture */
  onNewArchitecture() {
    this.canvas.clearAll();
  }
}
