import { Component, ViewChild } from '@angular/core';
import { TopbarComponent } from '../topbar/topbar.component';
import { ServicePaletteComponent } from '../service-palette/service-palette.component';
import { CanvasComponent } from '../canvas/canvas.component';
import { TerraformPreviewComponent } from '../terraform-preview/terraform-preview.component';
import { IaPromptComponent } from '../ia-prompt/ia-prompt';

@Component({
  selector: 'app-workspace',
  standalone: true,
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.css'],
  imports: [
    TopbarComponent,
    ServicePaletteComponent,
    CanvasComponent,
    TerraformPreviewComponent,
    IaPromptComponent
  ],
})
export class WorkspaceComponent {
  projectName = 'novo projeto';

  @ViewChild('canvas') canvas!: CanvasComponent;

  // Estado do painel flutuante
  promptOpen = false;
  promptLoading = false;
  promptResponse: string | null = null;
  promptError: string | null = null;

  onNewArchitecture() {
    this.canvas.clearAll();
    this.projectName = 'novo projeto';
  }

  onProjectNameChange(newName: string) {
    this.projectName = newName;
  }

  togglePrompt() {
    this.promptOpen = !this.promptOpen;
  }

  onPromptSubmit(text: string) {
    // Por enquanto só demonstra: mostra "enviando", simula retorno e mantém no front
    this.promptLoading = true;
    this.promptError = null;
    this.promptResponse = null;

    // aqui você pode trocar pelo serviço real de IA
    setTimeout(() => {
      this.promptLoading = false;
      this.promptResponse = `Prompt recebido: ${text}\n(Conecte ao seu endpoint de IA para retornar algo útil aqui.)`;
    }, 600);
  }
}
