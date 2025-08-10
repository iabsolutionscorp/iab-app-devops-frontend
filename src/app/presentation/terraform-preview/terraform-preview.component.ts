import {
  Component,
  Input,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TerraformGeneratorService } from '../../infra/services/terraform-generator.service';

@Component({
  selector: 'app-terraform-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './terraform-preview.component.html',
  styleUrls: ['./terraform-preview.component.css']
})
export class TerraformPreviewComponent implements OnChanges {
  /** JSON de entrada: { resources: [...] } */
  @Input() configJson: any;

  /** HCL gerado */
  terraformCode = '';

  constructor(private gen: TerraformGeneratorService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['configJson']) {
      this.terraformCode = this.gen.generate(this.configJson || {});
    }
  }
}
