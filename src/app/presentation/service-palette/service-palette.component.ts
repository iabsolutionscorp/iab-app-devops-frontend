import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-service-palette',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './service-palette.component.html',
  styleUrls: ['./service-palette.component.css'],
})
export class ServicePaletteComponent {
  services = [
    { label: 'EC2',    icon: '/icons/ec2.png'    },
    { label: 'Dynamo', icon: '/icons/dynamo.png' },
    { label: 'ECS',    icon: '/icons/ecs.png'    },
    { label: 'VPC',    icon: '/icons/vpc.png'    },
    { label: 'Glue',   icon: '/icons/glue.png'   },
    { label: 'S3',     icon: '/icons/s3.png'     },
  ];

  onPaletteDrop(event: CdkDragDrop<any>) {
    // Bloqueia qualquer reordenação dentro do próprio palette
    if (event.previousContainer === event.container) {
      return;
    }
    // Se quiser tratar drops vindos de outros containers, faça aqui
  }
}
