-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(25) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `themePreference` ENUM('LIGHT', 'DARK', 'SYSTEM') NOT NULL DEFAULT 'LIGHT',
    `avatarObjectKey` VARCHAR(255) NULL,
    `lastActiveOrganizationId` CHAR(25) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Organization` (
    `id` CHAR(25) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `kind` ENUM('SOLO', 'AGENCY') NOT NULL,
    `logoObjectKey` VARCHAR(255) NULL,
    `publicEmail` VARCHAR(191) NULL,
    `publicPhone` VARCHAR(32) NULL,
    `publicBio` TEXT NULL,
    `plan` ENUM('FREE', 'PRO') NOT NULL DEFAULT 'FREE',
    `leadVisibility` ENUM('OWN') NOT NULL DEFAULT 'OWN',
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Organization_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationSlugHistory` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `releasedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrganizationSlugHistory_slug_key`(`slug`),
    INDEX `OrganizationSlugHistory_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Membership` (
    `id` CHAR(25) NOT NULL,
    `userId` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MANAGER', 'AGENT') NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Membership_userId_idx`(`userId`),
    INDEX `Membership_organizationId_role_idx`(`organizationId`, `role`),
    UNIQUE INDEX `Membership_userId_organizationId_key`(`userId`, `organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invitation` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MANAGER', 'AGENT') NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `invitedByMembershipId` CHAR(25) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invitation_tokenHash_key`(`tokenHash`),
    INDEX `Invitation_invitedByMembershipId_idx`(`invitedByMembershipId`),
    INDEX `Invitation_email_idx`(`email`),
    UNIQUE INDEX `Invitation_organizationId_email_acceptedAt_key`(`organizationId`, `email`, `acceptedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(25) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userId` CHAR(25) NOT NULL,
    `activeOrganizationId` CHAR(25) NULL,
    `ipHash` VARCHAR(191) NULL,
    `userAgent` VARCHAR(255) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` CHAR(25) NOT NULL,
    `userId` CHAR(25) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationToken` (
    `id` CHAR(25) NOT NULL,
    `userId` CHAR(25) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformAdmin` (
    `id` CHAR(25) NOT NULL,
    `userId` CHAR(25) NOT NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformAdmin_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Property` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `type` ENUM('APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL', 'RURAL', 'OTHER') NOT NULL,
    `purpose` ENUM('SALE', 'RENT', 'BOTH') NOT NULL,
    `status` ENUM('DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'RENTED', 'INACTIVE') NOT NULL DEFAULT 'DRAFT',
    `price` DECIMAL(12, 2) NULL,
    `rentPrice` DECIMAL(12, 2) NULL,
    `condoFee` DECIMAL(12, 2) NULL,
    `iptu` DECIMAL(12, 2) NULL,
    `bedrooms` INTEGER NULL,
    `bathrooms` INTEGER NULL,
    `suites` INTEGER NULL,
    `parkingSpots` INTEGER NULL,
    `areaTotal` DECIMAL(10, 2) NULL,
    `areaUseful` DECIMAL(10, 2) NULL,
    `state` VARCHAR(2) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `neighborhood` VARCHAR(191) NOT NULL,
    `zipCode` VARCHAR(16) NULL,
    `street` VARCHAR(191) NULL,
    `number` VARCHAR(32) NULL,
    `complement` VARCHAR(191) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `addressVisibility` ENUM('FULL', 'STREET_ONLY', 'NEIGHBORHOOD_ONLY') NOT NULL DEFAULT 'NEIGHBORHOOD_ONLY',
    `ownerMemberId` CHAR(25) NULL,
    `publishedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Property_organizationId_status_publishedAt_idx`(`organizationId`, `status`, `publishedAt`),
    INDEX `Property_organizationId_ownerMemberId_idx`(`organizationId`, `ownerMemberId`),
    INDEX `Property_organizationId_city_neighborhood_idx`(`organizationId`, `city`, `neighborhood`),
    INDEX `Property_status_publishedAt_idx`(`status`, `publishedAt`),
    UNIQUE INDEX `Property_organizationId_code_key`(`organizationId`, `code`),
    UNIQUE INDEX `Property_organizationId_slug_key`(`organizationId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyFeature` (
    `id` CHAR(25) NOT NULL,
    `propertyId` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `feature` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PropertyFeature_organizationId_idx`(`organizationId`),
    UNIQUE INDEX `PropertyFeature_propertyId_feature_key`(`propertyId`, `feature`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PropertyMedia` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `propertyId` CHAR(25) NOT NULL,
    `objectKey` VARCHAR(255) NOT NULL,
    `kind` ENUM('PHOTO', 'FLOORPLAN', 'VIDEO', 'DOCUMENT') NOT NULL,
    `position` INTEGER NOT NULL,
    `altText` VARCHAR(255) NULL,
    `isCover` BOOLEAN NOT NULL DEFAULT false,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `byteSize` INTEGER NULL,
    `contentType` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PropertyMedia_organizationId_idx`(`organizationId`),
    INDEX `PropertyMedia_propertyId_kind_idx`(`propertyId`, `kind`),
    UNIQUE INDEX `PropertyMedia_propertyId_position_key`(`propertyId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(191) NULL,
    `source` ENUM('PUBLIC_CATALOG', 'MANUAL', 'IMPORT', 'REFERRAL', 'OTHER') NOT NULL,
    `assignedMemberId` CHAR(25) NULL,
    `status` ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED') NOT NULL DEFAULT 'NEW',
    `notes` TEXT NULL,
    `consentGivenAt` DATETIME(3) NULL,
    `privacyNoticeVersion` VARCHAR(32) NULL,
    `consentIpHash` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `anonymizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Lead_organizationId_assignedMemberId_createdAt_idx`(`organizationId`, `assignedMemberId`, `createdAt`),
    INDEX `Lead_organizationId_assignedMemberId_status_idx`(`organizationId`, `assignedMemberId`, `status`),
    INDEX `Lead_organizationId_phone_idx`(`organizationId`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inquiry` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `propertyId` CHAR(25) NOT NULL,
    `leadId` CHAR(25) NOT NULL,
    `message` TEXT NULL,
    `sourceUrl` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Inquiry_organizationId_propertyId_createdAt_idx`(`organizationId`, `propertyId`, `createdAt`),
    INDEX `Inquiry_leadId_idx`(`leadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PipelineStage` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `position` INTEGER NOT NULL,
    `isWon` BOOLEAN NOT NULL DEFAULT false,
    `isLost` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PipelineStage_organizationId_position_key`(`organizationId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Deal` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `leadId` CHAR(25) NOT NULL,
    `propertyId` CHAR(25) NULL,
    `stageId` CHAR(25) NOT NULL,
    `assignedMemberId` CHAR(25) NULL,
    `expectedAmount` DECIMAL(12, 2) NULL,
    `closedAt` DATETIME(3) NULL,
    `lostReason` VARCHAR(255) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Deal_organizationId_stageId_assignedMemberId_idx`(`organizationId`, `stageId`, `assignedMemberId`),
    INDEX `Deal_leadId_idx`(`leadId`),
    INDEX `Deal_propertyId_idx`(`propertyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Visit` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `propertyId` CHAR(25) NOT NULL,
    `leadId` CHAR(25) NULL,
    `assignedMemberId` CHAR(25) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELED', 'NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Visit_organizationId_assignedMemberId_startsAt_idx`(`organizationId`, `assignedMemberId`, `startsAt`),
    INDEX `Visit_propertyId_idx`(`propertyId`),
    INDEX `Visit_leadId_idx`(`leadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `leadId` CHAR(25) NULL,
    `dealId` CHAR(25) NULL,
    `propertyId` CHAR(25) NULL,
    `assignedMemberId` CHAR(25) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'DONE', 'CANCELED') NOT NULL DEFAULT 'OPEN',
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Task_organizationId_assignedMemberId_status_dueAt_idx`(`organizationId`, `assignedMemberId`, `status`, `dueAt`),
    INDEX `Task_leadId_idx`(`leadId`),
    INDEX `Task_dealId_idx`(`dealId`),
    INDEX `Task_propertyId_idx`(`propertyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Activity` (
    `id` CHAR(25) NOT NULL,
    `organizationId` CHAR(25) NOT NULL,
    `actorMembershipId` CHAR(25) NULL,
    `actorPlatformAdminId` CHAR(25) NULL,
    `entityType` VARCHAR(64) NOT NULL,
    `entityId` CHAR(25) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `metadata` JSON NULL,
    `ipHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Activity_organizationId_entityType_entityId_createdAt_idx`(`organizationId`, `entityType`, `entityId`, `createdAt`),
    INDEX `Activity_actorMembershipId_idx`(`actorMembershipId`),
    INDEX `Activity_actorPlatformAdminId_idx`(`actorPlatformAdminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrganizationSlugHistory` ADD CONSTRAINT `OrganizationSlugHistory_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_invitedByMembershipId_fkey` FOREIGN KEY (`invitedByMembershipId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformAdmin` ADD CONSTRAINT `PlatformAdmin_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Property` ADD CONSTRAINT `Property_ownerMemberId_fkey` FOREIGN KEY (`ownerMemberId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyFeature` ADD CONSTRAINT `PropertyFeature_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyFeature` ADD CONSTRAINT `PropertyFeature_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyMedia` ADD CONSTRAINT `PropertyMedia_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PropertyMedia` ADD CONSTRAINT `PropertyMedia_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_assignedMemberId_fkey` FOREIGN KEY (`assignedMemberId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inquiry` ADD CONSTRAINT `Inquiry_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PipelineStage` ADD CONSTRAINT `PipelineStage_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `PipelineStage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_assignedMemberId_fkey` FOREIGN KEY (`assignedMemberId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Visit` ADD CONSTRAINT `Visit_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Visit` ADD CONSTRAINT `Visit_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Visit` ADD CONSTRAINT `Visit_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Visit` ADD CONSTRAINT `Visit_assignedMemberId_fkey` FOREIGN KEY (`assignedMemberId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assignedMemberId_fkey` FOREIGN KEY (`assignedMemberId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_actorMembershipId_fkey` FOREIGN KEY (`actorMembershipId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_actorPlatformAdminId_fkey` FOREIGN KEY (`actorPlatformAdminId`) REFERENCES `PlatformAdmin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

