import React, { useState } from 'react';
import { Search, CheckSquare, Square, Loader2, AlertCircle, Download } from 'lucide-react';

const WebsiteAuditTool = () => {
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [auditReport, setAuditReport] = useState(null);
  const [error, setError] = useState('');

  // Define all audit categories and their checkboxes
  const [auditOptions, setAuditOptions] = useState({
    userJourneys: {
      title: 'Mapping of the existing user journeys',
      items: {
        criticalJourneys: {
          label: 'Identify the most critical user journeys (based on business goals and user frequency)',
          checked: true,
        },
        userTypes: {
          label: 'Consider different user types',
          checked: true,
        },
        painPoints: {
          label: 'Pain Points: Friction, confusion, unnecessary steps, dead ends',
          checked: true,
        },
        happyPath: {
          label: 'Map both happy path and alternative/edge case scenarios',
          checked: true,
        },
        dropOffRisks: {
          label: 'Drop-off Risks: Where users are likely to abandon the flow',
          checked: true,
        },
        cognitiveLoad: {
          label: 'Cognitive Load: Mental effort required at each step',
          checked: true,
        },
        errorHandling: {
          label: 'Error Handling: What happens when things go wrong',
          checked: true,
        },
        efficiency: {
          label: 'Efficiency: Time and effort required to complete tasks',
          checked: true,
        },
        userEmotions: {
          label: 'User emotions and frustrations at different stages',
          checked: true,
        },
        mobileVsDesktop: {
          label: 'Mobile vs. desktop experience differences',
          checked: true,
        },
      },
    },
    userExperience: {
      title: 'User Experience',
      items: {
        navigation: {
          label: 'Navigation & Information Architecture',
          checked: true,
        },
        ctaPlacement: {
          label: 'Call-to-action placement and clarity',
          checked: true,
        },
        hoverStates: {
          label: 'Hover states and interactive elements behaviour',
          checked: true,
        },
        interactions: {
          label: 'Interactions / animations assessment',
          checked: true,
        },
        touchTargets: {
          label: 'Touch target sizing for mobile users',
          checked: true,
        },
        conversionPaths: {
          label: 'Primary conversion paths (contact, purchase, signup)',
          checked: true,
        },
        trustElements: {
          label: 'Trust & Credibility Elements',
          checked: true,
        },
        loadingStates: {
          label: 'Loading states and progress indicators',
          checked: true,
        },
        filterSorting: {
          label: 'Filter and sorting patterns',
          checked: true,
        },
      },
    },
    contentAssessment: {
      title: 'Content Assessment',
      items: {
        messageClarity: {
          label: 'Message clarity and value proposition communication',
          checked: true,
        },
        contentRelevance: {
          label: 'Content relevance to target audience and user needs',
          checked: true,
        },
        writingQuality: {
          label: 'Writing quality, grammar, and professional tone',
          checked: true,
        },
        imageQuality: {
          label: 'Image quality, relevance, and professional appearance',
          checked: true,
        },
        engagingOpening: {
          label: 'Engaging opening that hooks the reader immediately',
          checked: true,
        },
        logicalProgression: {
          label: 'Logical content progression that guides users through a journey',
          checked: true,
        },
        sufficientDetail: {
          label: 'Sufficient detail to answer user questions and build confidence',
          checked: true,
        },
        clearNextSteps: {
          label: 'Clear next steps or guidance on what to do after reading',
          checked: true,
        },
        personalTouches: {
          label: 'Personal touches that build trust and connection',
          checked: true,
        },
      },
    },
    accessibility: {
      title: 'Accessibility',
      items: {
        textContrast: {
          label: 'Text contrast (WCAG AA: 4.5:1 for normal text, 3:1 for large text)',
          checked: true,
        },
        nonTextContrast: {
          label: 'Non-text contrast (WCAG 2.1: 3:1 for UI components)',
          checked: true,
        },
        placeholderText: {
          label: 'Placeholder text (must meet contrast ratio)',
          checked: true,
        },
        focusIndicator: {
          label: 'Focus indicator (visible and clear, 3:1 contrast)',
          checked: true,
        },
        targetSize: {
          label: 'Target size (clickable areas at least 24x24px)',
          checked: true,
        },
        hoverOnlyInfo: {
          label: 'No hover-only info (must appear on focus/keyboard/tap)',
          checked: true,
        },
        reflow: {
          label: 'Reflow (content reflows to 320px width without horizontal scrolling)',
          checked: true,
        },
        zoom: {
          label: 'Zoom (UI scales up to 200% without breaking)',
          checked: true,
        },
        spacing: {
          label: 'Spacing (line height, letter spacing allow overrides)',
          checked: true,
        },
        colorAlone: {
          label: "Don't rely on color alone (status indicators need icon/label)",
          checked: true,
        },
        links: {
          label: 'Links (distinguishable by underline, bold, etc.)',
          checked: true,
        },
        states: {
          label: 'States (hover, active, disabled, focus visually distinct)',
          checked: true,
        },
        labels: {
          label: 'Labels (all form fields have visible, persistent labels)',
          checked: true,
        },
        errorMessages: {
          label: 'Error messages (clear, high-contrast, near relevant input)',
          checked: true,
        },
        touchTargets: {
          label: 'Touch targets (enough spacing on mobile to avoid accidental taps)',
          checked: true,
        },
      },
    },
  });

  // Toggle individual checkbox
  const toggleCheckbox = (category, itemKey) => {
    setAuditOptions(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        items: {
          ...prev[category].items,
          [itemKey]: {
            ...prev[category].items[itemKey],
            checked: !prev[category].items[itemKey].checked,
          },
        },
      },
    }));
  };

  // Toggle all checkboxes in a category
  const toggleCategory = (category) => {
    const allChecked = Object.values(auditOptions[category].items).every(item => item.checked);
    const newCheckedState = !allChecked;

    setAuditOptions(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        items: Object.keys(prev[category].items).reduce((acc, key) => ({
          ...acc,
          [key]: {
            ...prev[category].items[key],
            checked: newCheckedState,
          },
        }), {}),
      },
    }));
  };

  // Generate AI prompt based on selected options
  const generateAuditPrompt = (websiteContent) => {
    let prompt = `You are an expert UX/UI auditor and web accessibility specialist. Analyze the following website and provide a comprehensive audit report.

WEBSITE CONTENT:
${websiteContent}

AUDIT INSTRUCTIONS:
Analyze ONLY the following checked items and provide detailed findings, issues, and recommendations for each.

`;

    Object.entries(auditOptions).forEach(([categoryKey, category]) => {
      const checkedItems = Object.entries(category.items)
        .filter(([_, item]) => item.checked);
      
      if (checkedItems.length > 0) {
        prompt += `\n## ${category.title.toUpperCase()}\n`;
        checkedItems.forEach(([itemKey, item]) => {
          prompt += `\n✓ ${item.label}\n`;
        });
      }
    });

    prompt += `\n\nFORMAT YOUR RESPONSE AS JSON:
{
  "categories": [
    {
      "title": "Category Name",
      "items": [
        {
          "label": "Item label",
          "status": "good" | "warning" | "critical",
          "findings": "Detailed description of what you found",
          "issues": ["List of specific issues if any"],
          "recommendations": ["List of specific recommendations"]
        }
      ]
    }
  ]
}

IMPORTANT: 
- Be specific and actionable in your recommendations
- Use "good" status for things done well, "warning" for minor issues, "critical" for serious problems
- Provide code examples or specific changes where relevant
- If you cannot assess something (like actual performance metrics), state that clearly
- Respond ONLY with valid JSON, no other text`;

    return prompt;
  };

  // Main analysis function
  const analyzeWebsite = async () => {
    if (!url) {
      setError('Please enter a website URL');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setAuditReport(null);

    try {
      // Generate the complete audit prompt that includes fetching and analysis
      const completePrompt = `Please perform a comprehensive website audit for: ${url}

STEP 1: Use the web_fetch tool to fetch the complete website content, HTML, CSS, and structure.

STEP 2: THOROUGHLY examine ALL the fetched content. Important considerations:
- Many modern websites use lazy-loading, JavaScript rendering, and dynamic content
- Look carefully for: image tags with client logos, testimonial sections, team info, case studies
- Check class names, section headings, alt text, and content structure
- If you find evidence of something (like logo images or testimonial text), report it ACCURATELY
- If you CANNOT verify something from the HTML (may be JS-loaded), state "Cannot verify from static HTML - may be dynamically loaded"
- DO NOT assume something is missing just because it's not immediately obvious
- Be precise and honest about what you can and cannot see in the code

STEP 3: Analyze ONLY the following checked items and provide detailed findings, issues, and recommendations for each:

${Object.entries(auditOptions).map(([categoryKey, category]) => {
  const checkedItems = Object.entries(category.items).filter(([_, item]) => item.checked);
  if (checkedItems.length === 0) return '';
  return `\n## ${category.title.toUpperCase()}\n${checkedItems.map(([_, item]) => `✓ ${item.label}`).join('\n')}`;
}).filter(Boolean).join('\n')}

IMPORTANT OUTPUT FORMAT:
Respond ONLY with a valid JSON object in this exact structure:
{
  "categories": [
    {
      "title": "Category Name",
      "items": [
        {
          "label": "Item label",
          "status": "good" | "warning" | "critical",
          "findings": "Detailed description of what you found",
          "issues": ["List of specific issues if any"],
          "recommendations": ["List of specific recommendations"]
        }
      ]
    }
  ]
}

ANALYSIS GUIDELINES:
- Be specific and actionable in your recommendations
- Use "good" status for things done well, "warning" for minor issues, "critical" for serious problems
- Provide code examples or specific changes where relevant
- Focus on actual observable issues from the website content
- When analyzing trust elements (logos, testimonials, case studies): Look for <img> tags, testimonial sections, client name mentions, and quote blocks
- If you see evidence of these elements in the HTML, acknowledge them positively
- Do NOT output anything other than the JSON object - no markdown, no backticks, no explanations`;

      // Single API call that handles both fetching and analysis
      console.log('Starting comprehensive audit...');
      const auditResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          messages: [{
            role: 'user',
            content: completePrompt
          }]
        })
      });

      if (!auditResponse.ok) {
        const errorData = await auditResponse.text();
        console.error('API Error:', errorData);
        throw new Error(`API request failed with status ${auditResponse.status}. Please check console for details.`);
      }

      const auditData = await auditResponse.json();
      let auditText = auditData.content[0].text;
      
      console.log('Raw response:', auditText);
      
      // Clean up the response if it has markdown code blocks or extra text
      auditText = auditText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      // Try to find JSON in the response if there's extra text
      const jsonMatch = auditText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        auditText = jsonMatch[0];
      }
      
      const auditJson = JSON.parse(auditText);
      
      // Validate the structure
      if (!auditJson.categories || !Array.isArray(auditJson.categories)) {
        throw new Error('Invalid audit report structure received');
      }
      
      setAuditReport(auditJson);

    } catch (err) {
      console.error('Analysis error:', err);
      let errorMessage = err.message;
      
      if (err.message.includes('JSON')) {
        errorMessage = 'Failed to parse audit report. The AI response was not in the expected format. Please try again.';
      } else if (err.message.includes('fetch')) {
        errorMessage = 'Failed to connect to the AI service. Please check your internet connection and try again.';
      }
      
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'good':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            AI Website Audit Tool
          </h1>
          <p className="text-gray-400 text-lg">
            Comprehensive UX, Content, and Accessibility Analysis
          </p>
        </div>

        {/* URL Input Section */}
        <div className="bg-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-2xl border border-gray-700">
          <label className="block text-sm font-medium mb-2 text-gray-300">
            Website URL
          </label>
          <div className="flex gap-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-white placeholder-gray-500"
              disabled={isAnalyzing}
            />
            <button
              onClick={analyzeWebsite}
              disabled={isAnalyzing || !url}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Start Audit
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-200">{error}</p>
            </div>
          )}
        </div>

        {/* Audit Options - Only show when not analyzing and no report */}
        {!isAnalyzing && !auditReport && (
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Select Audit Criteria</h2>
            <p className="text-gray-400 mb-6">
              All items are checked by default. Uncheck any items you don't want to analyze.
            </p>

            {Object.entries(auditOptions).map(([categoryKey, category]) => {
              const checkedCount = Object.values(category.items).filter(item => item.checked).length;
              const totalCount = Object.values(category.items).length;
              const allChecked = checkedCount === totalCount;

              return (
                <div key={categoryKey} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                  <div 
                    className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-gray-700/50 p-2 rounded-lg transition-colors"
                    onClick={() => toggleCategory(categoryKey)}
                  >
                    {allChecked ? (
                      <CheckSquare className="w-6 h-6 text-blue-400 flex-shrink-0" />
                    ) : (
                      <Square className="w-6 h-6 text-gray-500 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold">{category.title}</h3>
                      <p className="text-sm text-gray-400">{checkedCount} of {totalCount} selected</p>
                    </div>
                  </div>

                  <div className="space-y-3 pl-9">
                    {Object.entries(category.items).map(([itemKey, item]) => (
                      <div
                        key={itemKey}
                        className="flex items-start gap-3 cursor-pointer hover:bg-gray-700/30 p-2 rounded-lg transition-colors"
                        onClick={() => toggleCheckbox(categoryKey, itemKey)}
                      >
                        {item.checked ? (
                          <CheckSquare className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                        )}
                        <span className="text-gray-300 text-sm leading-relaxed">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Audit Report */}
        {auditReport && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold">Audit Report</h2>
              <button
                onClick={() => {
                  setAuditReport(null);
                  setUrl('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                New Audit
              </button>
            </div>

            {auditReport.categories.map((category, catIndex) => (
              <div key={catIndex} className="bg-gray-800 rounded-xl p-6 md:p-8 border border-gray-700">
                <h3 className="text-2xl font-bold mb-6 pb-4 border-b border-gray-700">
                  {category.title}
                </h3>

                <div className="space-y-6">
                  {category.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="border-l-4 pl-6 py-2" style={{
                      borderColor: item.status === 'good' ? '#10b981' : 
                                   item.status === 'warning' ? '#f59e0b' : '#ef4444'
                    }}>
                      <div className="flex items-start gap-3 mb-3">
                        <CheckSquare className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg mb-2">{item.label}</h4>
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)}`}>
                            {item.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div>
                          <p className="text-gray-300 leading-relaxed">{item.findings}</p>
                        </div>

                        {item.issues && item.issues.length > 0 && (
                          <div>
                            <p className="text-sm font-semibold text-red-400 mb-2">Issues Found:</p>
                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                              {item.issues.map((issue, i) => (
                                <li key={i} className="text-sm leading-relaxed">{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.recommendations && item.recommendations.length > 0 && (
                          <div>
                            <p className="text-sm font-semibold text-blue-400 mb-2">Recommendations:</p>
                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                              {item.recommendations.map((rec, i) => (
                                <li key={i} className="text-sm leading-relaxed">{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WebsiteAuditTool;
