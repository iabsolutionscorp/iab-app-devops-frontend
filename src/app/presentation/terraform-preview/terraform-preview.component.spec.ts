import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TerraformPreviewComponent } from './terraform-preview.component';

describe('TerraformPreviewComponent', () => {
  let component: TerraformPreviewComponent;
  let fixture: ComponentFixture<TerraformPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TerraformPreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TerraformPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
