-- {{< drawing drawing.json >}}
--
-- Embeds a saved drawing as solid colored lines. The JSON is inlined, so the
-- deck stays one file (works with embed-resources and from file://).
-- It also writes one invisible fragment per segment of the drawing, so the
-- slide advances the animation one click at a time. Segments are split by the
-- cues saved in the drawing: n cues make n + 1 segments.
--
-- Options (all optional):
--   auto="true"    play the first segment as soon as the slide appears
--   speed="1.5"    playback speed
--   width="60%"    any CSS width; the drawing keeps its 16:9 shape
--   wiggle="0.5"   how hand-drawn the lines look: 0 is perfectly smooth, 1 is the default, 2 is shakier

local counter = 0

local function read_json(path)
  local file = io.open(path, "r")
  if not file then
    return nil
  end
  local text = file:read("a")
  file:close()
  return text
end

local function resolve(path)
  if path:sub(1, 1) == "/" then
    return path
  end
  local input = quarto.doc.input_file
  local dir = input and pandoc.path.directory(input) or "."
  return pandoc.path.join({ dir, path })
end

local function option(kwargs, name, default)
  local value = kwargs[name]
  if value == nil then
    return default
  end
  local text = pandoc.utils.stringify(value)
  return text ~= "" and text or default
end

local function escape_attr(text)
  return (text:gsub("&", "&amp;"):gsub('"', "&quot;"):gsub("<", "&lt;"))
end

return {
  drawing = function(args, kwargs)
    if not quarto.doc.is_format("revealjs") then
      return pandoc.Null()
    end

    local path = args[1] and pandoc.utils.stringify(args[1]) or nil
    if not path then
      error("drawing: give the path to a saved drawing, e.g. {{< drawing drawing.json >}}")
    end
    local text = read_json(resolve(path))
    if not text then
      error("drawing: could not read " .. path)
    end
    local ok, data = pcall(quarto.json.decode, text)
    if not ok or type(data) ~= "table" then
      error("drawing: " .. path .. " is not a saved drawing")
    end

    local auto = option(kwargs, "auto", "false") == "true"
    local speed = option(kwargs, "speed", "1")
    local width = option(kwargs, "width", "100%")
    local wiggle = option(kwargs, "wiggle", "1")

    counter = counter + 1
    local id = "drawing-" .. counter

    local cues = type(data.cues) == "table" and #data.cues or 0
    local steps = cues + 1 - (auto and 1 or 0)

    -- "</" would end the script element early. "\/" is the same thing in JSON.
    local json = text:gsub("</", "<\\/")

    local html = {
      string.format(
        '<div class="drawing" id="%s" data-auto="%s" data-speed="%s" data-wiggle="%s" style="width: %s">',
        id, tostring(auto), escape_attr(speed), escape_attr(wiggle), escape_attr(width)
      ),
      '<script type="application/json" class="drawing-data">' .. json .. "</script>",
      "</div>",
    }
    for _ = 1, steps do
      table.insert(html, string.format('<span class="fragment drawing-step" data-drawing="%s"></span>', id))
    end
    return pandoc.RawBlock("html", table.concat(html, "\n"))
  end,
}
