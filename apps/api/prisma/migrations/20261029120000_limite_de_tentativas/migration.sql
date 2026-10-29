-- CreateTable
CREATE TABLE `RateLimitHit` (
    `key` CHAR(64) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 1,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `RateLimitHit_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`, `windowStart`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
