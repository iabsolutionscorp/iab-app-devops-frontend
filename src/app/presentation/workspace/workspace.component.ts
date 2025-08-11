import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TopbarComponent } from '../topbar/topbar.component';
import { ServicePaletteComponent } from '../service-palette/service-palette.component';
import { CanvasComponent } from '../canvas/canvas.component';
import { TerraformPreviewComponent } from '../terraform-preview/terraform-preview.component';
import { IaPromptComponent } from '../ia-prompt/ia-prompt';

import { IacService } from '../../infra/services/iac-file.service';
import { GenerateIacFileRequest } from '../../infra/model/generate-iac-file-request.model';
import { IacTypeEnum } from '../../infra/model/iac-type.enum';

import { fromEvent, Subscription } from 'rxjs';

@Component({
  selector: 'app-workspace',
  standalone: true,
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.css'],
  imports: [
    CommonModule,                // para *ngIf, *ngFor no template
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

  // refs para redimensionar painel direito
  @ViewChild('mainContent', { static: true }) mainContent!: ElementRef<HTMLDivElement>;
  @ViewChild('terraformPane', { static: true }) terraformPane!: ElementRef<HTMLDivElement>;

  terraformJson: any = {};

  // === redimensionar painel direito ===
  private resizing = false;
  private moveSub?: Subscription;
  private upSub?: Subscription;

  // === IA Prompt (painel flutuante) ===
  promptOpen = false;
  promptLoading = false;
  promptResponse: string | null = null;
  promptError: string | null = null;

  constructor(private iac: IacService) {}

  // ----- Resize handlers -----
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
    const min = 340;                               // mínimo painel direito
    const minCanvas = 420;                         // mínimo canvas à esquerda
    const max = Math.min(container.width - minCanvas, 900);
    newWidth = Math.max(min, Math.min(newWidth, max));
    this.terraformPane.nativeElement.style.width = `${newWidth}px`;
  }

  private stopResize() {
    this.resizing = false;
    this.moveSub?.unsubscribe();
    this.upSub?.unsubscribe();
  }

  // ----- Topbar actions -----
  onNewArchitecture() {
    this.canvas.clearAll();
    this.projectName = 'novo projeto';
    this.terraformJson = {};
  }

  onProjectNameChange(newName: string) {
    this.projectName = newName;
  }

  // ----- Terraform live config (vindo do editor da direita) -----
  onLiveConfig(config: any) {
    this.terraformJson = config || {};
    this.canvas.loadFromConfig(this.terraformJson);
  }

  // ----- IA Prompt panel -----
  togglePrompt() {
    this.promptOpen = !this.promptOpen;
  }

  // conectado ao endpoint via IacService.generateCode$
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
            // se vier JSON, formata; senão, exibe como veio
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

  onPromptReplace(): void {
    // ajuste aqui se quiser aplicar o resultado diretamente no editor/canvas
    console.log('Clique em Substituir — implemente a ação aqui.');
  }
}
