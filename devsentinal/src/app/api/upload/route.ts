import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import { parsePDF } from '@/lib/parsers/pdf';
import { parseDOCX } from '@/lib/parsers/docx';
import { parseMarkdown } from '@/lib/parsers/markdown';
import { extractRequirements } from '@/lib/ai/gemini';
import type { UploadResponse, Document, Requirement } from '@/types';

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('project_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing project_id' },
        { status: 400 }
      );
    }

    // Detect file type from extension
    const filename = file.name;
    const ext = filename.split('.').pop()?.toLowerCase();

    if (!ext || !['pdf', 'md', 'docx'].includes(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Accepted: .pdf, .md, .docx' },
        { status: 400 }
      );
    }

    const fileType = ext as 'pdf' | 'md' | 'docx';

    // Verify the project exists and belongs to the user
    const supabase = createServerClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse file content using the appropriate parser
    const buffer = Buffer.from(await file.arrayBuffer());
    let parsedContent: string;

    switch (fileType) {
      case 'pdf':
        parsedContent = await parsePDF(buffer);
        break;
      case 'docx':
        parsedContent = await parseDOCX(buffer);
        break;
      case 'md':
        parsedContent = await parseMarkdown(buffer.toString('utf-8'));
        break;
    }

    // Store document record in documents table
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        project_id: projectId,
        filename,
        file_type: fileType,
        storage_path: `uploads/${projectId}/${filename}`,
        parsed_content: parsedContent,
      })
      .select()
      .single();

    if (docError || !document) {
      console.error('[POST /api/upload] Failed to insert document:', docError);
      return NextResponse.json(
        { error: 'Failed to store document' },
        { status: 500 }
      );
    }

    // Call Gemini to extract structured requirements from parsed text
    const extracted = await extractRequirements(parsedContent);

    // Store each extracted requirement in requirements table
    const requirementRows = extracted.map((r) => ({
      document_id: document.id,
      project_id: projectId,
      category: r.category,
      feature_name: r.feature_name,
      description: r.description,
      endpoint: r.endpoint,
      http_method: r.http_method,
      expected_behavior: r.expected_behavior,
      priority: r.priority,
    }));

    const { data: requirements, error: reqError } = await supabase
      .from('requirements')
      .insert(requirementRows)
      .select();

    if (reqError || !requirements) {
      console.error(
        '[POST /api/upload] Failed to insert requirements:',
        reqError
      );
      return NextResponse.json(
        { error: 'Failed to store requirements' },
        { status: 500 }
      );
    }

    const response: UploadResponse = {
      document: document as Document,
      requirements: requirements as Requirement[],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/upload]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
