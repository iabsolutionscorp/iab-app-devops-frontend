import { Component, ViewChild } from '@angular/core';
import { TopbarComponent } from '../topbar/topbar.component';
import { ServicePaletteComponent } from '../service-palette/service-palette.component';
import { CanvasComponent } from '../canvas/canvas.component';
import { TerraformPreviewComponent } from '../terraform-preview/terraform-preview.component';

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
  projectName = 'novo projeto';
  @ViewChild('canvas') canvas!: CanvasComponent;

  terraformJson: any = {};

  onNewArchitecture() {
    this.canvas.clearAll();
    this.projectName = 'novo projeto';
    this.terraformJson = {};
  }

  onProjectNameChange(newName: string) {
    this.projectName = newName;
  }

  /** Recebe JSON vindo da digitação no painel (tempo real) e aplica no Canvas */
  onLiveConfig(config: any) {
    this.terraformJson = config || {};
    this.canvas.loadFromConfig(this.terraformJson);
  }
}
