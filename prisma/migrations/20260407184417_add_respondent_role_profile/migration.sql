-- CreateEnum
CREATE TYPE "RespondentRole" AS ENUM ('self', 'manager', 'colleague', 'client');

-- AlterTable
ALTER TABLE "competencies" ADD COLUMN     "group_name" TEXT;

-- AlterTable
ALTER TABLE "respondents" ADD COLUMN     "department" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "role" "RespondentRole" NOT NULL DEFAULT 'colleague';
