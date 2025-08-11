// src/app/presentation/workspace/workspace.component.ts
import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TopbarComponent } from '../topbar/topbar.component';
import { ServicePaletteComponent } from '../service-palette/service-palette.component';
import { CanvasComponent } from '../canvas/canvas.component';
import { TerraformPreviewComponent } from '../terraform-preview/terraform-preview.component';
import { IaPromptComponent } from '../ia-prompt/ia-prompt';
import {IacService} from '../../infra/services/iac-file.service';
import {GenerateIacFileRequest} from '../../infra/model/generate-iac-file-request.model';
import {IacTypeEnum} from '../../infra/model/iac-type.enum';

// >>> SERVICE E MODELOS (conforme você enviou)


@Component({
  selector: 'app-workspace',
  standalone: true,
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.css'],
  imports: [
    CommonModule,                // resolve *ngIf e afins no template
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

  constructor(private iac: IacService) {}

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

  // === AGORA CONECTADO AO ENDPOINT /v1/generate via IacService.generateCode$ ===
  onPromptSubmit(text: string) {
    if (!text || !text.trim()) {
      this.promptError = 'Digite um prompt antes de enviar.';
      return;
    }
    this.promptOpen = true;
    this.promptLoading = true;
    this.promptError = null;
    this.promptResponse = null;

    const req: GenerateIacFileRequest = {
      prompt: text,
      type: IacTypeEnum.TERRAFORM,
    } as any;

    this.iac.generateCode$(req).subscribe({
      next: ({ blob, filename }) => {
        blob.text()
          .then((txt) => {
            this.promptLoading = false;
            // se vier JSON, formata bonitinho; se não, exibe como veio
            try {
              const parsed = JSON.parse(txt);
              this.promptResponse = JSON.stringify(parsed, null, 2);
            } catch {
              this.promptResponse = txt;
            }
          })
          .catch(() => {
            this.promptLoading = false;
            this.promptResponse = `Arquivo gerado${filename ? `: ${filename}` : ''}. (Conteúdo binário — não exibível aqui)`;
          });
      },
      error: (err) => {
        this.promptLoading = false;
        this.promptError =
          err?.error?.message ??
          err?.message ??
          'Erro ao gerar IAC.';
        console.error('generateCode$ error:', err);
      }
    });
  }
}
