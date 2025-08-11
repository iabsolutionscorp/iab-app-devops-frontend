import { Component, Input, Output, EventEmitter } from '@angular/core';
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
  @Input() loading = false;
  @Input() response: string | null = null;
  @Input() error: string | null = null;

  @Output() promptSubmit = new EventEmitter<string>();
  @Output() replace = new EventEmitter<void>();   // botão “Substituir”

  text = '';

  onSubmit() {
    this.promptSubmit.emit(this.text);
  }

  onClear() {
    this.text = '';
  }

  onReplaceClick() {
    this.replace.emit();
  }
}
