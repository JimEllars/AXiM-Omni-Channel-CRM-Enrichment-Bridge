import re

with open("src/components/PipelineDesigner.jsx", "r") as f:
    content = f.read()

target = """  const saveConfiguration = async () => {
    setIsSaving(true);
    try {
      await configService.set('pipeline_designer_state', steps);
      // Simulate deployment delay
      await new Promise(r => setTimeout(r, 1000));
    } finally {
      setIsSaving(false);
    }
  };"""

new_save = """  const saveConfiguration = async () => {
    setIsSaving(true);
    try {
      await configService.set('pipeline_designer_state', steps);
      // Also save to backend worker for dynamic rule execution
      const key = sessionStorage.getItem('AXIM_AUTH_KEY') || import.meta.env.VITE_AXIM_INTERNAL_KEY || '';
      try {
        await fetch('/v1/management/pipeline-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AXiM-Internal-Auth': key
          },
          body: JSON.stringify(steps)
        });
      } catch (err) {
        console.error("Failed to deploy pipeline to edge worker", err);
      }
    } finally {
      setIsSaving(false);
    }
  };"""

content = content.replace(target, new_save)

with open("src/components/PipelineDesigner.jsx", "w") as f:
    f.write(content)
