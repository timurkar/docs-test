import { Tooltip, useNotifications } from '@kodemo/util';
import { CheckIcon, ClipboardCopyIcon } from '@radix-ui/react-icons';
import React from 'react';
import { Effect } from 'src/KodemoPlayer';
import styled from 'styled-components';
import { CodeEditor } from '../components/CodeEditor';
import useKodemoConfig from '../hooks/useKodemoConfig';
import useKodemoState, { DocumentSelectors, ISubject, KodemoStateSelectors } from '../hooks/useKodemoState';
import { diffCode } from '../util/code';
import * as Subject from './Subject';

const StyledContent = styled(Subject.Content)`
  .ko-subject-version {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow-x: hidden;
  }

  pre {
    margin: 0 !important;
    font-size: ${({ theme }) => theme.fontSize.s} !important;
    background-color: transparent !important;
  }

  code {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 0;
  }

  code[data-state='transitioning'] .cm-scroller {
    overflow-x: hidden;
  }

  .has-highlights .cm-editor .cm-line:not(.cm-highlight) {
    opacity: 0.3;
  }

  &:after {
    content: '';
    position: absolute;
    bottom: 0;
    width: 100%;
    height: 14px;
    background: linear-gradient(transparent, ${(props) => props.theme.colors.bgSubjects});
  }

  @media only screen and ${(prop) => prop.theme.breakpoints.s} {
    pre {
      font-size: ${(prop) => prop.theme.fontSize.xs} !important;
    }

    .cm-scroller {
      line-height: 1.5;
    }
  }
`;

const StyledCopyToClipboard = styled.button`
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  top: 0.75rem;
  right: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  z-index: 1;
  border-radius: ${(props) => props.theme.rounding.m};

  &:hover {
    background-color: ${(props) => props.theme.colors.active};
    color: #fff;
  }

  @media only screen and ${(prop) => prop.theme.breakpoints.s} {
    display: none;
  }
`;

interface ICodeSubject extends ISubject {
  language?: string;
}

export const CodeSubject = ({ subjectId, ...props }: any) => {
  const subject: ICodeSubject = useKodemoState((state) => DocumentSelectors.subject(state, subjectId));
  const currentEffect = useKodemoState((state) => state.currentEffect);

  const previousEffectRef = React.useRef<Effect | null>();
  const versionsRef = React.useRef<{
    [id: string]: any; // TODO Use CodeEditor once it has types
  }>({});

  const language = React.useMemo(() => {
    // Prefer explicit language via subject config
    if (typeof subject.language === 'string') {
      return subject.language;
    }
    // Fall back on implicit language by file extension
    else {
      return useKodemoConfig.getState().getSubjectByFilename(subject.name)?.language || '';
    }
  }, [subject.name, subject.language]);

  // Trigger a code transition when the current effect changes
  React.useEffect(() => {
    // We're targeting this subject
    if (currentEffect && currentEffect.subject === subjectId) {
      const previousEffect = previousEffectRef.current;
      const isSameEffect = previousEffect && previousEffect.id === currentEffect.id;

      let hasTransitioned = false;

      // Run an animated transition if...
      // 1. There is a previously active effect for this subject
      // 2. The previous and current effect are not the same
      if (previousEffect && !isSameEffect) {
        const fromContent = subject.versions[previousEffect.version || '']?.value;
        const toContent = subject.versions[currentEffect.version || '']?.value;

        if (fromContent && toContent) {
          const { pairedLines, addedLines, removedLines } = diffCode(fromContent, toContent);

          const fromVersion = versionsRef.current[previousEffect.version || ''];
          const toVersion = versionsRef.current[currentEffect.version || ''];

          toVersion.transition({ fromVersion, pairedLines, addedLines, removedLines });
          hasTransitioned = true;
        }
      }

      // Run an instant transition if...
      // 1. We did not run an animated transition
      // 2. The previous and current effect are not the same
      if (!hasTransitioned && !isSameEffect) {
        versionsRef.current[currentEffect.version || '']?.transition({ fromVersion: null });
      }
    }

    previousEffectRef.current = currentEffect;
  }, [currentEffect]);

  return (
    <StyledContent {...props}>
      {Object.entries(subject.versions).map(([id, version], i) => {
        return (
          <CodeVersion
            key={id}
            versionId={id}
            subjectId={subjectId}
            value={version.value}
            language={language}
            ref={(el) => (versionsRef.current[id] = el)}
          />
        );
      })}
    </StyledContent>
  );
};

interface CodeVersionProps {
  subjectId: string;
  versionId: string;
  value: string;
  language: string;
}

const CodeVersion = React.forwardRef(
  ({ subjectId, versionId, value, language, ...props }: CodeVersionProps, forwardRef) => {
    const { showNotification } = useNotifications();
    const copyCodeEnabled = useKodemoConfig((state) => state.copyCode);
    const [copied, setCopied] = React.useState(false);

    const currentEffect = useKodemoState(KodemoStateSelectors.currentEffect);
    const editable = useKodemoState((state) => state.editing);
    const subject = useKodemoState((state) => DocumentSelectors.subject(state, subjectId));

    const codeHighlights = currentEffect?.subject === subjectId ? currentEffect?.getCodeHighlights() : null;

    const editor = React.useRef<any>(null);
    const preElement = React.useRef(null);

    let isActive = false;

    // Are we the active subject?
    if (subject && currentEffect && currentEffect.subject === subjectId) {
      const versionKeys = Object.keys(subject.versions);
      const thisVersionIndex = versionKeys.indexOf(versionId);
      const activeVersionIndex = versionKeys.indexOf(currentEffect.version || '');

      // Fallback when version IDs can't be found
      // - The targeted version does not exist
      // - We are the first version
      if (activeVersionIndex === -1 && thisVersionIndex === 0) {
        isActive = true;
      }
      // Otherwise this version is only active when it directly matches the
      // current effect's version ID
      else if (currentEffect.version === versionId) {
        isActive = true;
      }
    }

    // Called when the code editor content changes
    const handleContentChange = (value: string) => {
      useKodemoState.getState().updateSubjectVersion(subjectId, versionId, { value });
    };

    const handleCopyToClipboard = () => {
      navigator.clipboard.writeText(value);
      showNotification({ title: 'Copied code to clipboard', icon: <ClipboardCopyIcon /> });
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    };

    React.useEffect(() => {
      if (isActive && editor.current && codeHighlights) {
        editor.current.highlightLines(codeHighlights.toArray());
      }
    }, [codeHighlights]);

    React.useImperativeHandle(forwardRef, () => editor.current);

    return (
      <pre className={'ko-subject-version' + (isActive ? ' active' : '')} ref={preElement} {...props}>
        {copyCodeEnabled && (
          <Tooltip.Tip text="Copy code to clipboard">
            <StyledCopyToClipboard onClick={handleCopyToClipboard}>
              {copied === true ? <CheckIcon /> : <ClipboardCopyIcon />}
            </StyledCopyToClipboard>
          </Tooltip.Tip>
        )}
        <CodeEditorWithoutTypes
          ref={editor}
          value={value}
          language={language}
          editable={editable}
          active={isActive}
          onContentChange={handleContentChange}
        />
      </pre>
    );
  }
);

// TODO Use CodeEditor once it has types
const CodeEditorWithoutTypes: any = CodeEditor;
