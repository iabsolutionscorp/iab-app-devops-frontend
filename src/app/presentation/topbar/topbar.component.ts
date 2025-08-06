import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.css']
})
export class TopbarComponent {
  /** Emite quando o usuário confirma a criação de nova arquitetura */
  @Output() newArchitecture = new EventEmitter<void>();

  /** Handler do botão "Nova arquitetura" */
  onNewArchitectureClick() {
    const confirmed = window.confirm(
      'Tem certeza que deseja criar nova arquitetura? Isso apagará tudo e criará novamente.'
    );
    if (confirmed) {
      this.newArchitecture.emit();
    }
  }
}
