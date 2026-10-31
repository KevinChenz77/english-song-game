import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** 遊戲說明（佔位：第二波搬說明文字、獎勵表、範例小卡）。 */
@Component({
  imports: [RouterLink],
  selector: 'app-help',
  templateUrl: './help.html',
})
export class Help {}
