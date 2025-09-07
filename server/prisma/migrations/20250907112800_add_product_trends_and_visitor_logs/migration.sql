-- CreateTable
CREATE TABLE `product_trends` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `totalProducts` INTEGER NOT NULL DEFAULT 0,
    `productsAdded` INTEGER NOT NULL DEFAULT 0,
    `productsRemoved` INTEGER NOT NULL DEFAULT 0,

    INDEX `product_trends_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visitor_logs` (
    `id` VARCHAR(191) NOT NULL,
    `visitedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `path` VARCHAR(191) NULL,

    INDEX `visitor_logs_visitedAt_idx`(`visitedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
