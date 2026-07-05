
CREATE POLICY "Users read own tour files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tour-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own tour files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tour-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own tour files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tour-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
