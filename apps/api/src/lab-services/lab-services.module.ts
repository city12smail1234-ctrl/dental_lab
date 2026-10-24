import { Module } from '@nestjs/common';
import { AdminLabServicesController, LabServicesController } from './lab-services.controller';
import { LabServicesService } from './lab-services.service';

@Module({ controllers: [LabServicesController, AdminLabServicesController], providers: [LabServicesService] })
export class LabServicesModule {}
