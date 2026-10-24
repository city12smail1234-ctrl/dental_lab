import { Module } from '@nestjs/common';
import { AdminLabCasesController, LabCasesController } from './lab-cases.controller';
import { LabCasesService } from './lab-cases.service';

@Module({ controllers: [LabCasesController, AdminLabCasesController], providers: [LabCasesService] })
export class LabCasesModule {}
