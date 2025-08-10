import {IacTypeEnum} from './iac-type.enum';

export interface IacFileResponse {
  id: number;
  name: string;
  type: IacTypeEnum;
  url?: string;
}
