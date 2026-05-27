package handler

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func TestAppendFormIntoConfigAppendsUniqueForm(t *testing.T) {
	origin := []byte(`server:
  port: 8080
forms:
  - name: existing_form
    title: Existing
    description: Existing form
    fields:
      - name: field_a
        label: Field A
        type: text
`)

	created := []byte(`forms:
  - name: new_form
    title: New Form
    description: New form description
    fields:
      - name: field_b
        label: Field B
        type: text
`)

	merged, formName, err := appendFormIntoConfig(origin, created)
	if err != nil {
		t.Fatalf("appendFormIntoConfig returned error: %v", err)
	}
	if formName != "new_form" {
		t.Fatalf("expected formName new_form, got %q", formName)
	}

	var root map[string]interface{}
	if err := yaml.Unmarshal(merged, &root); err != nil {
		t.Fatalf("unmarshal merged yaml: %v", err)
	}
	forms, ok := root["forms"].([]interface{})
	if !ok {
		t.Fatalf("forms should be a slice, got %T", root["forms"])
	}
	if len(forms) != 2 {
		t.Fatalf("expected 2 forms after append, got %d", len(forms))
	}
	if got := getFormNameFromNode(forms[1]); got != "new_form" {
		t.Fatalf("expected appended form name new_form, got %q", got)
	}
}

func TestAppendFormIntoConfigRejectsDuplicateName(t *testing.T) {
	origin := []byte(`forms:
  - name: duplicate_form
    title: Existing
    description: Existing form
    fields:
      - name: field_a
        label: Field A
        type: text
`)

	created := []byte(`forms:
  - name: duplicate_form
    title: Duplicate
    description: Duplicate form
    fields:
      - name: field_b
        label: Field B
        type: text
`)

	_, _, err := appendFormIntoConfig(origin, created)
	if err == nil {
		t.Fatal("expected duplicate name error, got nil")
	}
	if err.Error() != "表单 duplicate_form 已存在，请更换 name" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRemoveFormFromConfigRemovesTargetForm(t *testing.T) {
	origin := []byte(`forms:
  - name: keep_form
    title: Keep
    description: Keep form
    fields:
      - name: keep_field
        label: Keep Field
        type: text
  - name: drop_form
    title: Drop
    description: Drop form
    fields:
      - name: drop_field
        label: Drop Field
        type: text
`)

	merged, err := removeFormFromConfig(origin, "drop_form")
	if err != nil {
		t.Fatalf("removeFormFromConfig returned error: %v", err)
	}

	var root map[string]interface{}
	if err := yaml.Unmarshal(merged, &root); err != nil {
		t.Fatalf("unmarshal merged yaml: %v", err)
	}
	forms, ok := root["forms"].([]interface{})
	if !ok {
		t.Fatalf("forms should be a slice, got %T", root["forms"])
	}
	if len(forms) != 1 {
		t.Fatalf("expected 1 form after remove, got %d", len(forms))
	}
	if got := getFormNameFromNode(forms[0]); got != "keep_form" {
		t.Fatalf("expected keep_form to remain, got %q", got)
	}
}

func TestRemoveFormFromConfigReturnsErrorWhenNotFound(t *testing.T) {
	origin := []byte(`forms:
  - name: keep_form
    title: Keep
    description: Keep form
    fields:
      - name: keep_field
        label: Keep Field
        type: text
`)

	_, err := removeFormFromConfig(origin, "missing_form")
	if err == nil {
		t.Fatal("expected not found error, got nil")
	}
	if err.Error() != "未找到表单 missing_form" {
		t.Fatalf("unexpected error: %v", err)
	}
}
