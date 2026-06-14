-- 联合身份:外部 IdP(our-chat)token 按 (issuer, subject) 映射本地用户,不复用 sub 作主键。
ALTER TABLE "users" ADD COLUMN "issuer" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "subject" VARCHAR(64);

-- NULL 在 UNIQUE 索引下互不相等,本地用户(issuer/subject 均为 null)可有多行;
-- 同一外部主体 (issuer, subject) 至多一行,保证幂等 findOrCreate。
CREATE UNIQUE INDEX "users_issuer_subject_key" ON "users"("issuer", "subject");
