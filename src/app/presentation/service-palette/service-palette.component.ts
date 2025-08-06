import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-service-palette',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './service-palette.component.html',
  styleUrls: ['./service-palette.component.css'],
})
export class ServicePaletteComponent {
  services = [
    { label: 'EC2',    icon: 'assets/icons/ec2.png'    },
    { label: 'S3',     icon: 'assets/icons/s3.png'     },
    { label: 'Lambda', icon: 'assets/icons/lambda.png' },
  ];
}
