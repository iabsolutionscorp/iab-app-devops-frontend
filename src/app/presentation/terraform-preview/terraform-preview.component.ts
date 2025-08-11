import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

import { TerraformGeneratorService } from '../../infra/services/terraform-generator.service'; // do branch DELE
import { TerraformHclParserService } from '../../services/terraform-hcl-parser.service';       // parser do nosso branch

@Component({
  selector: 'app-terraform-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './terraform-preview.component.html',
  styleUrls: ['./terraform-preview.component.css'],
})
export class TerraformPreviewComponent implements OnInit, OnChanges, OnDestroy {
  /** JSON vindo do Workspace/Canvas */
  @Input() configJson: any = {};

  /** Emite JSON quando o usuário edita o HCL manualmente (tempo real) */
  @Output() liveConfig = new EventEmitter<any>();

  /** Texto do editor (HCL) */
  hclText = '';

  /** Erro de parsing (mostra discreto no UI) */
  parseError: string | null = null;

  /** Flag para não disparar parse quando atualizamos programaticamente */
  private programmatic = false;

  private input$ = new Subject<string>();
  private sub?: Subscription;

  constructor(
    private gen: TerraformGeneratorService,
    private parser: TerraformHclParserService
  ) {}

  ngOnInit(): void {
    // Debounce da digitação -> tenta parsear -> emite JSON válido
    this.sub = this.input$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(text => {
        if (this.programmatic) return;
        try {
          const parsed = this.parser.parse(text || '');
          this.parseError = null;
          this.liveConfig.emit(parsed);
        } catch {
          this.parseError = 'Não foi possível interpretar este Terraform.';
          // não emite nada em caso de erro
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('configJson' in changes) {
      // Workspace mudou -> gera HCL e atualiza editor (sem loop)
      const newHcl = this.gen.generate(this.configJson || {});
      this.programmatic = true;
      this.hclText = newHcl;
      // libera após o ciclo de renderização
      setTimeout(() => (this.programmatic = false));
    }
  }

  /** Chamado pelo (ngModelChange) do textarea/ace-editor */
  onEditorChange(value: string) {
    this.input$.next(value ?? '');
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
