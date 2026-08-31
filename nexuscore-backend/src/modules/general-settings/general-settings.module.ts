import { Module } from '@nestjs/common';
import { ScreenParameterController } from './screen-parameter.controller';
import { ScreenParameterService } from './screen-parameter.service';

@Module({
  controllers: [ScreenParameterController],
  providers: [ScreenParameterService],
})
export class GeneralSettingsModule {}
