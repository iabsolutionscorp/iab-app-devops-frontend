import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { TerraformGeneratorService } from '../../services/terraform-generator.service';
import { TerraformHclParserService } from '../../services/terraform-hcl-parser.service';

@Component({
  selector: 'app-terraform-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './terraform-preview.component.html',
  styleUrls: ['./terraform-preview.component.css'],
})
export class TerraformPreviewComponent implements OnInit, OnChanges, OnDestroy {
  /** JSON vindo do Workspace (gerado pelo Canvas) */
  @Input() configJson: any = {};

  /** Emite JSON quando o usuário edita o HCL no textarea */
  @Output() liveConfig = new EventEmitter<any>();

  /** Texto do editor (HCL) */
  hclText = '';
  /** Erro de parsing (exibido discretamente) */
  parseError: string | null = null;

  /** evita loop quando atualizamos o editor programaticamente */
  private programmatic = false;

  private input$ = new Subject<string>();
  private sub?: Subscription;

  constructor(
    private gen: TerraformGeneratorService,
    private parser: TerraformHclParserService
  ) {}

  ngOnInit(): void {
    // Debounce da digitação -> parse -> emite JSON
    this.sub = this.input$
      .pipe(debounceTime(100), distinctUntilChanged())
      .subscribe(text => {
        if (this.programmatic) return;
        try {
          const parsed = this.parser.parse(text || '');
          this.parseError = null;
          this.liveConfig.emit(parsed);
        } catch (e: any) {
          this.parseError = 'Não foi possível interpretar este Terraform.';
          // não emite nada em caso de erro
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('configJson' in changes) {
      // Canvas/Workspace mudou -> gerar HCL e atualizar editor (sem disparar parse)
      const newHcl = this.gen.generate(this.configJson || {});
      this.programmatic = true;
      this.hclText = newHcl;
      // libera após o ciclo de renderização
      setTimeout(() => (this.programmatic = false));
    }
  }

  onEditorChange(v: string) {
    // usuário digitou -> tentar aplicar com debounce
    this.input$.next(v);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
