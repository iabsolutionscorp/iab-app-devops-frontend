import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServicePaletteComponent } from './service-palette.component';

describe('ServicePaletteComponent', () => {
  let component: ServicePaletteComponent;
  let fixture: ComponentFixture<ServicePaletteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServicePaletteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServicePaletteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
