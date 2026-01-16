import { useState } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  Link as LinkIcon,
  Calendar,
  Tag,
} from 'lucide-react';
import { Button, Input, Textarea, Modal, Badge } from '../../components/common';
import { useKanbanStore } from '../../store/kanbanStore';
import { useTodoStore } from '../../store/todoStore';
import type { KanbanCard } from '../../types';
import styles from './Kanban.module.css';

export function Kanban() {
  const {
    columns,
    cards,
    addColumn,
    updateColumn,
    deleteColumn,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
  } = useKanbanStore();

  const { getTodosByKanbanCard } = useTodoStore();

  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
  const [newCardColumn, setNewCardColumn] = useState<string | null>(null);
  const [newCardContent, setNewCardContent] = useState('');
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [cardMenuOpen, setCardMenuOpen] = useState<string | null>(null);

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  const getCardsByColumn = (columnId: string) => {
    return cards
      .filter((card) => card.columnId === columnId)
      .sort((a, b) => a.order - b.order);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    moveCard(draggableId, destination.droppableId, destination.index);
  };

  const handleAddCard = (columnId: string) => {
    if (!newCardContent.trim()) return;

    addCard({
      columnId,
      content: newCardContent.trim(),
      labels: [],
    });

    setNewCardContent('');
    setNewCardColumn(null);
  };

  const handleUpdateCard = () => {
    if (!editingCard) return;
    updateCard(editingCard.id, editingCard);
    setEditingCard(null);
  };

  const handleAddColumn = () => {
    if (!newColumnTitle.trim()) return;

    addColumn({
      title: newColumnTitle.trim(),
    });

    setNewColumnTitle('');
    setShowAddColumn(false);
  };

  const handleUpdateColumnTitle = (columnId: string, title: string) => {
    updateColumn(columnId, { title });
    setEditingColumn(null);
  };

  return (
    <div className={styles.container}>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className={styles.board}>
          {sortedColumns.map((column) => (
            <div key={column.id} className={styles.column}>
              <div className={styles.columnHeader}>
                {editingColumn === column.id ? (
                  <Input
                    value={column.title}
                    onChange={(e) => updateColumn(column.id, { title: e.target.value })}
                    onBlur={() => setEditingColumn(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateColumnTitle(column.id, column.title);
                      if (e.key === 'Escape') setEditingColumn(null);
                    }}
                    autoFocus
                    className={styles.columnTitleInput}
                  />
                ) : (
                  <h3
                    className={styles.columnTitle}
                    onClick={() => setEditingColumn(column.id)}
                  >
                    {column.title}
                    <span className={styles.columnCount}>
                      {getCardsByColumn(column.id).length}
                    </span>
                  </h3>
                )}
                <button
                  className={styles.columnMenu}
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this column?')) {
                      deleteColumn(column.id);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`${styles.columnContent} ${
                      snapshot.isDraggingOver ? styles.draggingOver : ''
                    }`}
                  >
                    {getCardsByColumn(column.id).map((card, index) => (
                      <Draggable key={card.id} draggableId={card.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`${styles.card} ${
                              snapshot.isDragging ? styles.dragging : ''
                            }`}
                          >
                            <div className={styles.cardHeader}>
                              <span className={styles.cardContent}>{card.content}</span>
                              <div className={styles.cardActions}>
                                <button
                                  className={styles.cardActionButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCardMenuOpen(cardMenuOpen === card.id ? null : card.id);
                                  }}
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                                {cardMenuOpen === card.id && (
                                  <div className={styles.cardMenu}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCard(card);
                                        setCardMenuOpen(null);
                                      }}
                                    >
                                      <Edit2 size={14} />
                                      Edit
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteCard(card.id);
                                        setCardMenuOpen(null);
                                      }}
                                      className={styles.deleteButton}
                                    >
                                      <Trash2 size={14} />
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {card.description && (
                              <p className={styles.cardDescription}>{card.description}</p>
                            )}

                            <div className={styles.cardMeta}>
                              {card.linkedJiraIssue && (
                                <Badge size="sm" variant="primary">
                                  <LinkIcon size={10} />
                                  {card.linkedJiraIssue}
                                </Badge>
                              )}
                              {card.dueDate && (
                                <Badge size="sm" variant="warning">
                                  <Calendar size={10} />
                                  {new Date(card.dueDate).toLocaleDateString()}
                                </Badge>
                              )}
                              {card.labels.map((label) => (
                                <Badge key={label} size="sm">
                                  {label}
                                </Badge>
                              ))}
                            </div>

                            {getTodosByKanbanCard(card.id).length > 0 && (
                              <div className={styles.cardTodos}>
                                <span className={styles.todoCount}>
                                  {getTodosByKanbanCard(card.id).filter((t) => t.completed).length}/
                                  {getTodosByKanbanCard(card.id).length} todos
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {newCardColumn === column.id ? (
                      <div className={styles.newCardForm}>
                        <Textarea
                          placeholder="Enter card content..."
                          value={newCardContent}
                          onChange={(e) => setNewCardContent(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddCard(column.id);
                            }
                            if (e.key === 'Escape') {
                              setNewCardColumn(null);
                              setNewCardContent('');
                            }
                          }}
                        />
                        <div className={styles.newCardActions}>
                          <Button size="sm" onClick={() => handleAddCard(column.id)}>
                            Add Card
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setNewCardColumn(null);
                              setNewCardContent('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={styles.addCardButton}
                        onClick={() => setNewCardColumn(column.id)}
                      >
                        <Plus size={16} />
                        Add a card
                      </button>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}

          {/* Add Column */}
          {showAddColumn ? (
            <div className={styles.newColumnForm}>
              <Input
                placeholder="Column title..."
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn();
                  if (e.key === 'Escape') {
                    setShowAddColumn(false);
                    setNewColumnTitle('');
                  }
                }}
              />
              <div className={styles.newColumnActions}>
                <Button size="sm" onClick={handleAddColumn}>
                  Add Column
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddColumn(false);
                    setNewColumnTitle('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button className={styles.addColumnButton} onClick={() => setShowAddColumn(true)}>
              <Plus size={20} />
              Add Column
            </button>
          )}
        </div>
      </DragDropContext>

      {/* Edit Card Modal */}
      {editingCard && (
        <Modal
          isOpen={!!editingCard}
          onClose={() => setEditingCard(null)}
          title="Edit Card"
          size="md"
        >
          <div className={styles.editCardForm}>
            <Input
              label="Title"
              value={editingCard.content}
              onChange={(e) =>
                setEditingCard({ ...editingCard, content: e.target.value })
              }
            />

            <Textarea
              label="Description"
              value={editingCard.description || ''}
              onChange={(e) =>
                setEditingCard({ ...editingCard, description: e.target.value })
              }
              placeholder="Add a description..."
            />

            <Input
              label="Linked Jira Issue"
              value={editingCard.linkedJiraIssue || ''}
              onChange={(e) =>
                setEditingCard({ ...editingCard, linkedJiraIssue: e.target.value })
              }
              placeholder="e.g., PROJ-123"
              icon={<LinkIcon size={16} />}
            />

            <Input
              label="Due Date"
              type="date"
              value={editingCard.dueDate?.split('T')[0] || ''}
              onChange={(e) =>
                setEditingCard({
                  ...editingCard,
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
              icon={<Calendar size={16} />}
            />

            <Input
              label="Labels (comma separated)"
              value={editingCard.labels.join(', ')}
              onChange={(e) =>
                setEditingCard({
                  ...editingCard,
                  labels: e.target.value.split(',').map((l) => l.trim()).filter(Boolean),
                })
              }
              placeholder="e.g., bug, urgent, frontend"
              icon={<Tag size={16} />}
            />

            <div className={styles.editCardActions}>
              <Button onClick={handleUpdateCard}>Save Changes</Button>
              <Button variant="ghost" onClick={() => setEditingCard(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
