import { Module } from '@nestjs/common';
import { BeauticiansService } from './beauticians.service.js';
import { BeauticiansController } from './beauticians.controller.js';

@Module({
  controllers: [BeauticiansController],
  providers: [BeauticiansService],
  exports: [BeauticiansService],
})
export class BeauticiansModule {}
