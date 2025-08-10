import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ia-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ia-prompt.html',
  styleUrls: ['./ia-prompt.css']
})
export class IaPromptComponent {
  /** Texto digitado no prompt */
  prompt = '';

  /** Exibição (opcional) vinda do pai: resposta da IA */
  @Input() response: string | null = null;

  /** Flags opcionais controladas pelo pai */
  @Input() loading = false;
  @Input() error: string | null = null;

  /** Emite o texto do prompt quando clicar em Enviar (front-only) */
  @Output() promptSubmit = new EventEmitter<string>();

  onSend() {
    const text = this.prompt.trim();
    if (!text || this.loading) return;
    this.promptSubmit.emit(text);
  }

  onClear() {
    this.prompt = '';
    this.response = null;
    this.error = null;
  }
}
