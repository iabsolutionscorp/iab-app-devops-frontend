import { Component } from '@angular/core';
import { ServicePaletteComponent } from '../service-palette/service-palette.component';
import { CanvasComponent } from '../canvas/canvas.component';
import { TerraformPreviewComponent } from '../terraform-preview/terraform-preview.component';
import { TopbarComponent } from '../topbar/topbar.component'; // ✅ importação adicionada

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    TopbarComponent,              // ✅ topbar incluída
    ServicePaletteComponent,
    CanvasComponent,
    TerraformPreviewComponent
  ],
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.css']
})
export class WorkspaceComponent {}
