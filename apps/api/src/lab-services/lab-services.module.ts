import { Module } from '@nestjs/common';
import { AdminLabServicesController, LabServicesController, PublicPriceListController } from './lab-services.controller';
import { LabServicesService } from './lab-services.service';

@Module({ controllers: [LabServicesController, AdminLabServicesController, PublicPriceListController], providers: [LabServicesService] })
export class LabServicesModule {}
