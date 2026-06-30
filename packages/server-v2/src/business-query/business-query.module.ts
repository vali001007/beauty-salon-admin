import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BusinessTaskPreParserService } from '../agent/business-task/business-task-preparser.service.js';
import { ActionOntologyService } from '../agent/knowledge/action-ontology.service.js';
import { CapabilityCatalogService } from '../agent/knowledge/capability-catalog.service.js';
import { EntityResolverService } from '../agent/knowledge/entity-resolver.service.js';
import { SchemaGraphService } from '../agent/knowledge/schema-graph.service.js';
import { UnifiedQueryPlannerService } from '../agent/knowledge/unified-query-planner.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SemanticQueryModule } from '../semantic-query/semantic-query.module.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { BusinessQueryController } from './business-query.controller.js';
import { BusinessQueryService } from './business-query.service.js';

@Module({
  imports: [
    PrismaModule,
    SemanticQueryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [BusinessQueryController],
  providers: [
    BusinessQueryService,
    BusinessTaskPreParserService,
    ActionOntologyService,
    CapabilityCatalogService,
    EntityResolverService,
    SchemaGraphService,
    UnifiedQueryPlannerService,
    DeviceAuthGuard,
  ],
  exports: [BusinessQueryService],
})
export class BusinessQueryModule {}
