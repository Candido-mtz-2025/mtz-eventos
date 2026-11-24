CREATE ROLE orc_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE orc_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA orc AUTHORIZATION orc_owner;
COMMENT ON SCHEMA orc IS 'mtz-homologation-synthetic-only-v1';
SET ROLE orc_owner;
CREATE TABLE orc.companies (
  id uuid PRIMARY KEY, name text NOT NULL, policy text,
  genesis_text text NOT NULL CHECK(jsonb_typeof(genesis_text::jsonb)='object')
);
CREATE TABLE orc.users (
  id uuid PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL,
  active boolean NOT NULL DEFAULT true, UNIQUE(issuer,subject)
);
CREATE TABLE orc.members (
  tenant_id uuid REFERENCES orc.companies(id), user_id uuid REFERENCES orc.users(id),
  active boolean NOT NULL DEFAULT true, permissions text[] NOT NULL,
  PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE orc.state (
  tenant_id uuid PRIMARY KEY REFERENCES orc.companies(id), revision integer NOT NULL CHECK(revision>=0),
  snapshot_text text NOT NULL CHECK(jsonb_typeof(snapshot_text::jsonb)='object')
);
CREATE TABLE orc.journal (
  tenant_id uuid NOT NULL REFERENCES orc.companies(id), revision integer NOT NULL CHECK(revision>0),
  operation_id text NOT NULL, actor_id uuid NOT NULL REFERENCES orc.users(id),
  command text NOT NULL CHECK(command IN ('proposta.criar.v1','proposta.editar.v1')),
  data_text text NOT NULL, timestamp_text text NOT NULL, policy text NOT NULL,
  before_hash text NOT NULL, after_hash text NOT NULL, snapshot_text text NOT NULL,
  PRIMARY KEY(tenant_id,revision), UNIQUE(tenant_id,operation_id)
);
CREATE TABLE orc.receipts (
  tenant_id uuid NOT NULL, operation_id text NOT NULL, actor_id uuid NOT NULL REFERENCES orc.users(id),
  fingerprint text NOT NULL, revision integer NOT NULL, result jsonb NOT NULL,
  PRIMARY KEY(tenant_id,operation_id),
  FOREIGN KEY(tenant_id,revision) REFERENCES orc.journal(tenant_id,revision)
);
CREATE TABLE orc.audit (
  tenant_id uuid NOT NULL, operation_id text NOT NULL, revision integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES orc.users(id), evidence jsonb NOT NULL,
  PRIMARY KEY(tenant_id,operation_id),
  FOREIGN KEY(tenant_id,revision) REFERENCES orc.journal(tenant_id,revision)
);
CREATE FUNCTION orc.tenant() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('orc.tenant',true),'')::uuid $$;
CREATE FUNCTION orc.actor() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('orc.actor',true),'')::uuid $$;
CREATE FUNCTION orc.resolve_actor(p_issuer text,p_subject text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result uuid;
BEGIN
  SELECT id INTO result FROM orc.users WHERE issuer=p_issuer AND subject=p_subject AND active FOR SHARE;
  RETURN result;
END $$;
CREATE FUNCTION orc.lock_member(p_tenant uuid,p_user uuid) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result text[];
BEGIN
  SELECT permissions INTO result FROM orc.members
    WHERE tenant_id=p_tenant AND user_id=p_user AND active FOR SHARE;
  RETURN result;
END $$;
ALTER TABLE orc.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE orc.members FORCE ROW LEVEL SECURITY;
CREATE POLICY own_members ON orc.members USING(user_id=orc.actor());
ALTER TABLE orc.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE orc.companies FORCE ROW LEVEL SECURITY;
CREATE POLICY company_member ON orc.companies USING(EXISTS(
  SELECT 1 FROM orc.members m WHERE m.tenant_id=id AND m.user_id=orc.actor() AND m.active));
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['state','journal','receipts','audit'] LOOP
    EXECUTE format('ALTER TABLE orc.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE orc.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_member ON orc.%I USING(tenant_id=orc.tenant() AND EXISTS(SELECT 1 FROM orc.members m WHERE m.tenant_id=orc.tenant() AND m.user_id=orc.actor() AND m.active AND ''ler_propostas''=ANY(m.permissions))) WITH CHECK(tenant_id=orc.tenant() AND EXISTS(SELECT 1 FROM orc.members m WHERE m.tenant_id=orc.tenant() AND m.user_id=orc.actor() AND m.active AND (''criar_proposta''=ANY(m.permissions) OR ''editar_proposta''=ANY(m.permissions))))',t);
  END LOOP;
END $$;
RESET ROLE;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA orc FROM PUBLIC;
GRANT USAGE ON SCHEMA orc TO orc_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA orc TO orc_app;
GRANT SELECT ON orc.companies,orc.members,orc.state,orc.journal,orc.receipts,orc.audit TO orc_app;
GRANT UPDATE(revision,snapshot_text) ON orc.state TO orc_app;
GRANT INSERT ON orc.journal,orc.receipts,orc.audit TO orc_app;
-- Sem UPDATE/DELETE de journal, recibos, auditoria, politicas, membros ou usuarios.
