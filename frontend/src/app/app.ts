import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Cloud, CloudDialog } from './features/cloud/cloud-dialog';
import { Celebration } from './shared/celebration';

@Component({
  imports: [RouterOutlet, CloudDialog, Celebration],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly cloud = inject(Cloud);
}
