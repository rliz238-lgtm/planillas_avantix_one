-- Migration to add missing theme_preference column and ensure logo_url exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='theme_preference') THEN
        ALTER TABLE businesses ADD COLUMN theme_preference VARCHAR(20) DEFAULT 'dark';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='logo_url') THEN
        ALTER TABLE businesses ADD COLUMN logo_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='cycle_type') THEN
        ALTER TABLE businesses ADD COLUMN cycle_type VARCHAR(20) DEFAULT 'Weekly';
    END IF;
END $$;
