import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IaPrompt } from './ia-prompt';

describe('IaPrompt', () => {
  let component: IaPrompt;
  let fixture: ComponentFixture<IaPrompt>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IaPrompt]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IaPrompt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
