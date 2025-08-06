import {
  Component,
  EventEmitter,
  Output,
  Input,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.css']
})
export class TopbarComponent {
  /** Nome do projeto */
  @Input() projectName = 'projeto - microfrontend_iab_solutions';
  /** Emite quando o nome muda */
  @Output() projectNameChange = new EventEmitter<string>();
  /** Emite ao confirmar “Nova arquitetura” */
  @Output() newArchitecture = new EventEmitter<void>();

  /** Se está no modo edição */
  editingName = false;

  /** Referência ao input */
  @ViewChild('projectNameInput') projectNameInput!: ElementRef<HTMLInputElement>;

  onNewArchitectureClick() {
    const confirmed = window.confirm(
      'Tem certeza que deseja criar nova arquitetura? Isso apagará tudo e criará novamente.'
    );
    if (confirmed) {
      this.newArchitecture.emit();
    }
  }

  /** Inicia edição e foca+seleciona o texto do input */
  startEditingName() {
    this.editingName = true;
    // espera o Angular renderizar o <input>
    setTimeout(() => {
      const el = this.projectNameInput.nativeElement;
      el.focus();
      el.select();
    }, 0);
  }

  finishEditingName() {
    this.editingName = false;
    const name = this.projectName.trim() || 'novo projeto';
    this.projectName = name;
    this.projectNameChange.emit(name);
  }
}
