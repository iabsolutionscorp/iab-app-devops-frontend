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
import {IacService} from '../../infra/services/iac-file.service';
import {AwsCredentialsRequest} from '../../infra/model/aws-credentials-request.model';

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

  @Output() deploy = new EventEmitter<AwsCredentialsRequest>();

  /** Se está no modo edição */
  editingName = false;

  /** Referência ao input */
  @ViewChild('projectNameInput') projectNameInput!: ElementRef<HTMLInputElement>;

  constructor(private iacFileService: IacService) {
  }

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

  awsPanelOpen = false;
  awsSecretKey = '';
  awsAccessKeyId = '';
  awsRegion = '';

  toggleAwsPanel() {
    this.awsPanelOpen = !this.awsPanelOpen;
  }


  onDeploy() {
    this.deploy.emit({
      accessKeyId: this.awsAccessKeyId.trim(),
      secretAccessKey: this.awsSecretKey.trim(),
      region: this.awsRegion.trim()
    });
    this.awsPanelOpen = false;
  }
}
