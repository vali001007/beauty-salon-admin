import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { RolesModule } from './roles/roles.module.js';
import { StoresModule } from './stores/stores.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { ProductsModule } from './products/products.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { CardsModule } from './cards/cards.module.js';
import { BeauticiansModule } from './beauticians/beauticians.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';
import { MarketingModule } from './marketing/marketing.module.js';
import { MarketingPagesModule } from './marketing-pages/marketing-pages.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import { CommissionModule } from './commission/commission.module.js';
import { SupplyChainModule } from './supply-chain/supply-chain.module.js';
import { AiModule } from './ai/ai.module.js';
import { TerminalModule } from './terminal/terminal.module.js';
import { CustomerAppModule } from './customer-app/customer-app.module.js';
import { HealthModule } from './health/health.module.js';
import { BomModule } from './bom/bom.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { CsrfMiddleware } from './common/middleware/csrf.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    StoresModule,
    CustomersModule,
    ProductsModule,
    OrdersModule,
    CardsModule,
    BeauticiansModule,
    ProjectsModule,
    InventoryModule,
    SchedulingModule,
    ReservationsModule,
    MarketingModule,
    MarketingPagesModule,
    PromotionsModule,
    CommissionModule,
    SupplyChainModule,
    AiModule,
    TerminalModule,
    CustomerAppModule,
    DashboardModule,
    BomModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
