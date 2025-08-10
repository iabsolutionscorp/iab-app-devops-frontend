import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TerraformGeneratorService } from '../../services/terraform-generator.service';
import { TerraformHclParserService } from '../../services/terraform-hcl-parser.service';

@Component({
  selector: 'app-terraform-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './terraform-preview.component.html',
  styleUrls: ['./terraform-preview.component.css'],
})
export class TerraformPreviewComponent implements OnChanges {
  @Input() configJson: any = {};
  @Output() importConfig = new EventEmitter<any>();

  hcl = '';
  editMode = false;
  hclInput = '';

  constructor(
    private gen: TerraformGeneratorService,
    private parser: TerraformHclParserService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ('configJson' in changes) {
      this.hcl = this.gen.generate(this.configJson || {});
    }
  }

  toggleImport() {
    this.editMode = !this.editMode;
    this.hclInput = this.hcl || '';
  }

  applyImport() {
    try {
      const parsed = this.parser.parse(this.hclInput || '');
      this.importConfig.emit(parsed);
      this.editMode = false;
    } catch (e) {
      console.error('Erro ao parsear HCL:', e);
      alert('Não foi possível ler esse Terraform. Tente colar o HCL gerado aqui pelo app (Glue + Dynamo).');
    }
  }
}
