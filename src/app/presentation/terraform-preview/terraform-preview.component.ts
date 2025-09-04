import {Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {debounceTime, distinctUntilChanged, firstValueFrom, Subject, Subscription} from 'rxjs';

import {TerraformGeneratorService} from '../../infra/services/terraform-generator.service'; // MAIN
import {TerraformHclParserService} from '../../services/terraform-hcl-parser.service';
import {LocalstackNormalizerService} from '../../services/localstack-normalizer.service';
import {AwsCredentialsRequest} from '../../infra/model/aws-credentials-request.model';
import {IacService} from '../../infra/services/iac-file.service';
import {IacTypeEnum} from '../../infra/model/iac-type.enum'; // MESCLA

@Component({
  selector: 'app-terraform-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './terraform-preview.component.html',
  styleUrls: ['./terraform-preview.component.css'],
})
export class TerraformPreviewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() configJson: any = {};
  @Output() liveConfig = new EventEmitter<any>();

  @Output() hclText = '';
  parseError: string | null = null;

  private programmatic = false;
  private input$ = new Subject<string>();
  private sub?: Subscription;

  constructor(private localstack: LocalstackNormalizerService,
              private gen: TerraformGeneratorService,
              private parser: TerraformHclParserService,
              private iacService: IacService,
  ) {
  }

  ngOnInit(): void {
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
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('configJson' in changes) {
      const newHcl = this.gen.generate(this.configJson || {});
      this.programmatic = true;
      this.hclText = newHcl;
      setTimeout(() => (this.programmatic = false));
    }
  }

  onEditorChange(value: string) {
    value = this.localstack.ensure(value);
    this.input$.next(value ?? '');
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async deployWithCredentials(config: string, creds: AwsCredentialsRequest) {
    const file = new File([config], "main.tf", { type: "text/plain" });
    const id = await firstValueFrom(this.iacService.create$("iac", IacTypeEnum.TERRAFORM, file))

    this.iacService.deploy$(id, creds).subscribe({
      next: (res) => {},
      error: (err) => {},
    });
  }
}
