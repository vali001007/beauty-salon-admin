-- CreateTable
CREATE TABLE "SchedulingRuleConfig" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "businessStartTime" TEXT NOT NULL DEFAULT '09:00',
    "businessEndTime" TEXT NOT NULL DEFAULT '20:00',
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "peakRules" JSONB,
    "maxDailyHours" INTEGER,
    "maxWeeklyHours" INTEGER,
    "minRestMinutes" INTEGER,
    "defaultMinStaff" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingRuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeauticianAvailability" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "beauticianId" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'available',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeauticianAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeauticianTimeOff" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "beauticianId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeauticianTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartSchedulingRun" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "storeId" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "inputSnapshot" JSONB NOT NULL,
    "generatedSchedules" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "warnings" JSONB,
    "createdById" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartSchedulingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeauticianProjectSkill" (
    "id" SERIAL NOT NULL,
    "beauticianId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "skillLevel" INTEGER NOT NULL DEFAULT 1,
    "certified" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeauticianProjectSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreResource" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceBooking" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchedulingRuleConfig_storeId_status_idx" ON "SchedulingRuleConfig"("storeId", "status");

-- CreateIndex
CREATE INDEX "BeauticianAvailability_storeId_weekday_idx" ON "BeauticianAvailability"("storeId", "weekday");

-- CreateIndex
CREATE INDEX "BeauticianAvailability_beauticianId_weekday_idx" ON "BeauticianAvailability"("beauticianId", "weekday");

-- CreateIndex
CREATE INDEX "BeauticianAvailability_type_idx" ON "BeauticianAvailability"("type");

-- CreateIndex
CREATE INDEX "BeauticianTimeOff_storeId_date_idx" ON "BeauticianTimeOff"("storeId", "date");

-- CreateIndex
CREATE INDEX "BeauticianTimeOff_beauticianId_date_idx" ON "BeauticianTimeOff"("beauticianId", "date");

-- CreateIndex
CREATE INDEX "BeauticianTimeOff_status_idx" ON "BeauticianTimeOff"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SmartSchedulingRun_runId_key" ON "SmartSchedulingRun"("runId");

-- CreateIndex
CREATE INDEX "SmartSchedulingRun_storeId_weekStart_idx" ON "SmartSchedulingRun"("storeId", "weekStart");

-- CreateIndex
CREATE INDEX "SmartSchedulingRun_status_idx" ON "SmartSchedulingRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BeauticianProjectSkill_beauticianId_projectId_key" ON "BeauticianProjectSkill"("beauticianId", "projectId");

-- CreateIndex
CREATE INDEX "BeauticianProjectSkill_projectId_idx" ON "BeauticianProjectSkill"("projectId");

-- CreateIndex
CREATE INDEX "StoreResource_storeId_type_status_idx" ON "StoreResource"("storeId", "type", "status");

-- CreateIndex
CREATE INDEX "ResourceBooking_storeId_date_idx" ON "ResourceBooking"("storeId", "date");

-- CreateIndex
CREATE INDEX "ResourceBooking_resourceId_date_idx" ON "ResourceBooking"("resourceId", "date");

-- CreateIndex
CREATE INDEX "ResourceBooking_sourceType_sourceId_idx" ON "ResourceBooking"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ResourceBooking_status_idx" ON "ResourceBooking"("status");

-- AddForeignKey
ALTER TABLE "SchedulingRuleConfig" ADD CONSTRAINT "SchedulingRuleConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeauticianAvailability" ADD CONSTRAINT "BeauticianAvailability_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeauticianAvailability" ADD CONSTRAINT "BeauticianAvailability_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeauticianTimeOff" ADD CONSTRAINT "BeauticianTimeOff_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeauticianTimeOff" ADD CONSTRAINT "BeauticianTimeOff_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartSchedulingRun" ADD CONSTRAINT "SmartSchedulingRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartSchedulingRun" ADD CONSTRAINT "SmartSchedulingRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeauticianProjectSkill" ADD CONSTRAINT "BeauticianProjectSkill_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeauticianProjectSkill" ADD CONSTRAINT "BeauticianProjectSkill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreResource" ADD CONSTRAINT "StoreResource_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceBooking" ADD CONSTRAINT "ResourceBooking_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceBooking" ADD CONSTRAINT "ResourceBooking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "StoreResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
