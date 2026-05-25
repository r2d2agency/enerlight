The user wants to add a "thinking" animation (simulated calculation delay) when generating the report, and then automatically save the report to the system before showing the print option.

Steps:
1.  **Add `isGenerating` State**: Introduce a state to track when the calculation is "in progress" (simulated).
2.  **Add `reportGenerated` State**: Introduce a state to track if the report has already been saved to the system.
3.  **Implement `handleGenerateReport` Function**:
    *   This function will set `isGenerating(true)`.
    *   It will wait for 4 seconds (as requested).
    *   It will call the existing save logic (moved from `handlePrint` or improved).
    *   It will set `isGenerating(false)` and `setReportGenerated(true)`.
4.  **Update UI**:
    *   If `!reportGenerated` and `!isGenerating`, show a "Gerar Relatório" button.
    *   If `isGenerating`, show a loading animation with a message like "Processando seu relatório comercial...".
    *   If `reportGenerated`, show the success message "Cálculo Concluído com Sucesso!" and the "Imprimir" button.
5.  **Refactor `handlePrint`**: Remove the auto-save logic from `handlePrint` since it will be handled during generation.

Technical details:
*   File: `src/pages/CalculadoraLuminotecnica.tsx`
*   State variables: `[isGenerating, setIsGenerating]`, `[reportGenerated, setReportGenerated]`.
*   Timeout: `setTimeout` for 4000ms.
*   Animation: Use a spinner or a progress bar.
